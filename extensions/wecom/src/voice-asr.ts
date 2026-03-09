/**
 * 文件功能：封装豆包（火山引擎）短音频识别 API，将语音 Buffer 转为文字。
 * 主要类/函数：transcribeVoiceBuffer 发送识别请求并返回结果文本。
 * 关键依赖或环境变量：WECOM_DOUBAO_ASR_APP_ID、WECOM_DOUBAO_ASR_TOKEN、WECOM_DOUBAO_ASR_CLUSTER。
 */

import { randomUUID } from "node:crypto";

const DOUBAO_ASR_ENDPOINT = "https://openspeech.bytedance.com/api/v1/asr";
const ASR_TIMEOUT_MS = 30_000;

export interface DoubaoAsrConfig {
  appId: string;
  token: string;
  cluster: string;
}

/**
 * 将音频 Buffer 提交到豆包语音识别，返回识别出的文字。
 * format 默认 amr（企业微信语音消息格式），采样率 8000Hz 单声道。
 */
export async function transcribeVoiceBuffer(params: {
  config: DoubaoAsrConfig;
  audioBuffer: Buffer;
  format?: string;
}): Promise<string> {
  const { config, audioBuffer, format = "amr" } = params;

  // 火山引擎 ASR 要求音频以 base64 编码传入请求体。
  const base64Audio = audioBuffer.toString("base64");
  const reqId = randomUUID();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ASR_TIMEOUT_MS);

  try {
    const response = await fetch(DOUBAO_ASR_ENDPOINT, {
      method: "POST",
      headers: {
        // 火山引擎 ASR 鉴权格式：Bearer;<token>（分号分隔，非空格）
        Authorization: `Bearer;${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        app: {
          appid: config.appId,
          token: config.token,
          cluster: config.cluster,
        },
        user: { uid: "wecom-asr" },
        audio: {
          format,
          rate: 8000,
          language: "zh-CN",
          bits: 16,
          channel: 1,
          codec: "raw",
        },
        request: {
          reqid: reqId,
          nbest: 1,
          // 标准中文普通话识别工作流，含标点和逆文本规范化。
          workflow: "audio_in,resample,partition,vad,fe,vc,punc,itn",
          show_utterances: false,
          result_type: "single",
          sequence: -1,
        },
        data: base64Audio,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ASR 请求失败：HTTP ${response.status} ${text.slice(0, 200)}`);
    }

    const payload = (await response.json()) as {
      code: number;
      message: string;
      result?: Array<{ text: string; confidence?: number }>;
    };

    // code=1000 表示识别成功。
    if (payload.code !== 1000) {
      throw new Error(`ASR 识别错误：code=${payload.code}，message=${payload.message}`);
    }

    const text = (payload.result?.[0]?.text ?? "").trim();
    if (!text) {
      throw new Error("ASR 返回结果为空");
    }

    return text;
  } finally {
    clearTimeout(timer);
  }
}
