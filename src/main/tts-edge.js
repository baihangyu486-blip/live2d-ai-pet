/*
  tts-edge.js —— 微软 Edge 在线语音（免费、无需 API Key）的轻量客户端。

  用 ws 复刻 edge-tts 的 WebSocket 协议，输出 MP3 音频 Buffer。
  作为本地 IndexTTS2 之外的备用音源；也方便用户在没有本地 TTS 服务时快速发声。
*/

const crypto = require("crypto");
const { WebSocket } = require("ws");

const EDGE_HOST = "speech.platform.bing.com";
const EDGE_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_WS_URL =
  `wss://${EDGE_HOST}/consumer/speech/synthesize/readaloud/edge/v1` +
  `?TrustedClientToken=${EDGE_TOKEN}`;

const DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural";

const EDGE_VOICES = [
  "zh-CN-XiaoxiaoNeural",
  "zh-CN-XiaoyiNeural",
  "zh-CN-YunxiNeural",
  "zh-CN-YunyangNeural",
  "zh-CN-liaoning-XiaobeiNeural",
  "zh-CN-shaanxi-XiaoniNeural"
];

function createEdgeUuid() {
  return crypto.randomUUID().replace(/-/g, "");
}

function buildSpeechConfigMessage() {
  const config = JSON.stringify({
    context: {
      synthesis: {
        audio: {
          metadataoptions: {
            sentenceBoundaryEnabled: false,
            wordBoundaryEnabled: false
          },
          outputFormat: "audio-24khz-48kbitrate-mono-mp3"
        }
      }
    }
  });

  return [
    `X-Timestamp:${new Date().toUTCString()}`,
    "Content-Type:application/json; charset=utf-8",
    "Path:speech.config",
    "",
    config
  ].join("\r\n");
}

function buildSsmlMessage(text, options = {}) {
  const voice = options.voice || DEFAULT_VOICE;
  const rate = options.rate || "+0%";
  const pitch = options.pitch || "+0Hz";
  const volume = options.volume || "+0%";
  const cleanText = String(text || "")
    .replace(/[<>&]/g, "")
    .trim();

  return [
    `X-RequestId:${createEdgeUuid()}`,
    "Content-Type:application/ssml+xml",
    `X-Timestamp:${new Date().toUTCString()}`,
    "Path:ssml",
    "",
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>`,
    `<voice name='${voice}'><prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>`,
    cleanText,
    `</prosody></voice></speak>`
  ].join("\r\n");
}

/*
  调用 Edge TTS，返回 MP3 音频 Buffer。
  options: { voice, rate, pitch, volume, timeoutMs }
*/
function edgeTtsToBuffer(text, options = {}) {
  return new Promise((resolve, reject) => {
    const cleanText = String(text || "").trim();

    if (!cleanText) {
      reject(new Error("Edge TTS 文本为空。"));
      return;
    }

    const timeoutMs = Number(options.timeoutMs) || 60000;
    const connectionId = createEdgeUuid();
    const wsUrl = `${EDGE_WS_URL}&ConnectionId=${connectionId}`;
    const socket = new WebSocket(wsUrl, {
      host: EDGE_HOST,
      origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/103.0.5060.66 Safari/537.36 Edg/103.0.1264.44"
      }
    });

    const chunks = [];
    let settled = false;

    const finish = (error, buffer) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);

      try {
        socket.close();
      } catch {}

      if (error) {
        reject(error);
      } else {
        resolve(buffer);
      }
    };

    const timer = setTimeout(() => {
      finish(new Error("Edge TTS 请求超时。"));
    }, timeoutMs);

    socket.on("error", (error) => {
      finish(new Error(`Edge TTS 连接失败：${error?.message || error}`));
    });

    socket.on("close", () => {
      if (!settled && !chunks.length) {
        finish(new Error("Edge TTS 连接提前关闭。"));
      }
    });

    socket.on("message", (rawData, isBinary) => {
      if (!isBinary) {
        const data = String(rawData);

        if (data.includes("turn.end")) {
          finish(null, Buffer.concat(chunks));
        }
        return;
      }

      const separator = "Path:audio\r\n";
      const content = rawData.subarray(
        rawData.indexOf(separator) + separator.length
      );

      if (content.length) {
        chunks.push(content);
      }
    });

    socket.on("open", () => {
      socket.send(
        buildSpeechConfigMessage(),
        { compress: true },
        (configError) => {
          if (configError) {
            finish(configError);
            return;
          }

          socket.send(
            buildSsmlMessage(cleanText, options),
            { compress: true },
            (ssmlError) => {
              if (ssmlError) {
                finish(ssmlError);
              }
            }
          );
        }
      );
    });
  });
}

module.exports = {
  EDGE_HOST,
  EDGE_TOKEN,
  DEFAULT_VOICE,
  EDGE_VOICES,
  edgeTtsToBuffer
};
