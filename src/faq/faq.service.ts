// src/faq/faq.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from 'src/llm/llm.service';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

type TopicEntry = { topic: string; answer: string; aliases: string[] };

const STOP = new Set([
  'the','is','are','a','an','of','to','and','or','in','on','for','with','do','does','what','how','when','where','why','which',
  'you','we','i','it','that','this','these','those','your','my'
]);

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(t => !STOP.has(t));
}

function precisionMatchScore(queryTokens: Set<string>, candidateTokens: Set<string>) {
  if (queryTokens.size === 0) return 0;
  let inter = 0;
  for (const t of queryTokens) if (candidateTokens.has(t)) inter++;
  return inter / queryTokens.size;
}

@Injectable()
export class FaqService {
  private kb: TopicEntry[] = [];
  private TOPICS: string[] = [];
  private threshold = (() => {
    const v = Number(process.env.FAQ_CONFIDENCE_MIN);
    return Number.isFinite(v) ? v : 0.6;
  })();
  private kbPath = process.env.FAQ_KB_PATH || 'faq.yml';

  constructor(private prisma: PrismaService, private llm: LlmService) {
    this.loadKb();
  }

  // -------- KB load ----------
  private loadKb() {
    const file = path.resolve(process.cwd(), this.kbPath);
    if (!fs.existsSync(file)) {
      throw new BadRequestException(`FAQ file not found at ${file}. Set FAQ_KB_PATH or add faq.yml`);
    }
    const raw = fs.readFileSync(file, 'utf8');
    const doc = yaml.load(raw) as any[];
    if (!Array.isArray(doc)) {
      throw new BadRequestException('faq.yml must be an array of { topic, answer, aliases[] } objects.');
    }

    this.kb = doc.map((x, i) => {
      const topic = String(x.topic ?? '').trim().toLowerCase();
      const answer = String(x.answer ?? '').trim();
      const aliases = Array.isArray(x.aliases)
        ? x.aliases.map((s: any) => String(s ?? '').trim()).filter(Boolean)
        : [];
      if (!topic || !answer || aliases.length === 0) {
        throw new BadRequestException(`faq.yml item #${i} must have topic, answer, and non-empty aliases[]`);
      }
      return { topic, answer, aliases };
    });

    this.TOPICS = [...new Set(this.kb.map(k => k.topic))];
  }

  private async classifyQuestion(question: string): Promise<{ topic: string; keywords: string[] }> {
    const system = `You label user questions for a bootcamp FAQ.
Return ONLY a single JSON object with keys: topic, keywords.
- topic must be EXACTLY one of: ${this.TOPICS.map(t => `"${t}"`).join(', ')}
- keywords: 1-3 short words from the question (lowercase).`;
    const prompt = `Question: """${question}"""\nReturn JSON only.`;

    try {
      const raw = await this.llm.generate(prompt, 0.1, system);
      const match = raw.match(/\{[\s\S]*\}/);
      const json = JSON.parse(match ? match[0] : raw);
      let topic = String(json.topic || 'other').toLowerCase();
      const keywords = Array.isArray(json.keywords)
        ? json.keywords.map((k: any) => String(k).toLowerCase()).slice(0, 3)
        : [];
      return { topic, keywords };
    } catch {
      return { topic: this.heuristicTopic(question), keywords: normalize(question).slice(0, 3) };
    }
  }

  private heuristicTopic(question: string): string {
    const qt = normalize(question);
    const contains = (...ws: string[]) => ws.some(w => qt.includes(w));
    if (contains('tuition','cost','price','fee','fees','payment')) return 'tuition';
    if (contains('prerequisite','requirement','prereq','experience','knowledge','skill','skills')) return 'prerequisites';
    if (contains('job') && contains('guarantee')) return 'job guarantee';
    if (contains('schedule','duration','week','weeks','time','length')) return 'schedule';
    if (contains('scholarship','scholarships','aid','financial')) return 'scholarships';
    if (contains('start','begin','cohort','upcoming','date','startdate','starts')) return 'start dates';
    if (contains('apply','application','enroll','join','process','steps')) return 'application';
    if (contains('hello','hi','hey','greetings','morning','evening')) return 'greeting';
    if (contains('pay','paypal','payment method','methods')) return 'payment';
    return this.TOPICS.includes('other') ? 'other' : this.TOPICS[0];
  }

  private retrieveInsideTopic(question: string, topic: string) {
    const topicEntry = this.kb.find(k => k.topic === topic);
    if (!topicEntry) return { answer: '', idx: -1, confidence: 0 };

    const qTokens = new Set(normalize(question));
    let best = { idx: -1, score: 0 };
    topicEntry.aliases.forEach((alias, i) => {
      const cand = new Set(normalize(alias));
      const score = precisionMatchScore(qTokens, cand);
      if (score > best.score) best = { idx: i, score };
    });

    const confidence = Math.max(0, Math.min(1, best.score));
    return { answer: topicEntry.answer, idx: best.idx, confidence };
  }

  private politeFallback() {
    return "I'm not fully confident based on the FAQ. I’ve flagged this for a team member to review and follow up.";
  }

  private async summarizeWithLLM(turns: { question: string; answer: string }[]): Promise<string> {
    const qaPairs = turns.map(
      (t, i) => `Q${i+1}: ${t.question}\nA${i+1}: ${t.answer}`
    ).join("\n\n");

    const system = `You are an assistant helping bootcamp admins.
Generate a short, title-like summary (max 8 words) of the conversation topic.
It should read like a label admins can scan quickly.`;

    const prompt = `Conversation:\n${qaPairs}\n\nTitle:`;

    try {
      const summary = await this.llm.generate(prompt, 0.2, system);
      return summary.trim().replace(/^["'`]+|["'`]+$/g, '');
    } catch {
      return `Conversation about ${turns.length} question(s)`;
    }
  }

  // -------- Public entry: keep turns in one session if sessionId provided ----------
  async ask(input: { question: string; sessionId?: string; leadId?: string }) {
    if (!input?.question?.trim()) {
      throw new BadRequestException('question is required');
    }

    // classify + retrieve
    const { topic, keywords } = await this.classifyQuestion(input.question);
    const { answer, idx, confidence } = this.retrieveInsideTopic(input.question, topic);

    const noMatch = idx < 0 || !answer?.trim();
    const low = noMatch || confidence < this.threshold;
    const finalAnswer = low ? this.politeFallback() : answer;

    // Will we append to an existing session or create a new one?
    let sessionId = input.sessionId ?? null;
    let createdSession = null as null | { id: string; createdAt: Date; summary: string | null };

    if (!sessionId) {
      // create a brand-new session (leadId on FaqSession is a plain String? — safe to set directly)
      const summary = await this.summarizeWithLLM([{ question: input.question, answer: finalAnswer }]);
      const s = await this.prisma.faqSession.create({
        data: {
          leadId: input.leadId ?? null,
          summary,
        },
        select: { id: true, createdAt: true, summary: true },
      });
      sessionId = s.id;
      createdSession = s;
    }

    // Try to create a turn in the target session.
    // If sessionId is invalid (FK P2003), create a new session transparently and retry.
    let turnId: string;
    let turn;
    try {
      turn = await this.prisma.faqTurn.create({
        data: {
          sessionId: sessionId!, // we believe it exists
          question: input.question,
          answer: finalAnswer,
          topic,
          confidence,
          escalated: low,
        },
        select: {
    id: true,
    session: {
      select: {
        id: true,
        leadId: true,
        summary: true,
        createdAt: true,
        updatedAt: true,
      },
    },
  },
      });
      turnId = turn.id;
    } catch (e: any) {
      // Fallback on FK error (sessionId not found)
      const isP2003 = e?.code === 'P2003';
      if (!isP2003) throw e;

      const summary = await this.summarizeWithLLM([{ question: input.question, answer: finalAnswer }]);
      const s = await this.prisma.faqSession.create({
        data: {
          leadId: input.leadId ?? null,
          summary,
        },
        select: { id: true, createdAt: true, summary: true },
      });
      sessionId = s.id;
      createdSession = s;

      turn = await this.prisma.faqTurn.create({
        data: {
          sessionId: sessionId!,
          question: input.question,
          answer: finalAnswer,
          topic,
          confidence,
          escalated: low,
        },
        select: { id: true },
      });
      turnId = turn.id;
    }

    // Log Message WITHOUT leadId to avoid FK errors.
    await this.prisma.message.create({
      data: {
        type: low ? 'escalation' : 'faq',
        payload: {
          question: input.question,
          answer: finalAnswer,
          confidence,
          grounded: !low,
          sourceIndex: idx >= 0 ? idx : null,
          topic,
          keywords,
          faqSessionId: sessionId,
          faqTurnId: turnId,
        },
        // leadId intentionally omitted to avoid foreign key violations
      },
    });

    return {
      sessionId,
      turnId,
      answer: finalAnswer,
      confidence,
      grounded: !low,
      sources: low ? [] : [idx],
      topic,
      summary: createdSession?.summary ?? turn.session.summary ?? null,
      createdAt: createdSession?.createdAt ?? undefined,
    };
  }

listSessions() {
  return this.prisma.faqSession.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      leadId: true,
      summary: true,
      createdAt: true,
      turns: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, question: true, answer: true, topic: true, confidence: true, escalated: true, createdAt: true },
      },
    },
  });
}


  getSession(id: string) {
    return this.prisma.faqSession.findUnique({
      where: { id },
      select: {
        id: true,
        leadId: true,
        summary: true,
        createdAt: true,
        updatedAt: true,
        turns: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true, question: true, answer: true, topic: true, confidence: true, escalated: true, createdAt: true,
          },
        },
      },
    });
  }
}
