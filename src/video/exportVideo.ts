// リプレイを MP4 にする。使うときだけ動的 import で読み込む。
//   1. WebCodecs(H.264)+ Mediabunny で、実時間より速く作る
//   2. 1 が使えなければ、canvas.captureStream + MediaRecorder(MP4)で実時間で録画する
//   3. どちらも使えなければ null(呼び出し側で「このブラウザでは作れない」と表示する)

import type { BoardPalette } from '../app/render/boardView.ts';
import { FPS, drawVideoFrame, type FrameMeta, type VideoPlan } from './frames.ts';

export type VideoMethod = { kind: 'webcodecs'; size: number } | { kind: 'mediarecorder'; mimeType: string };

const SIZES = [1080, 720];

export async function detectVideoMethod(): Promise<VideoMethod | null> {
  if (typeof VideoEncoder !== 'undefined') {
    try {
      const { canEncodeVideo } = await import('mediabunny');
      for (const size of SIZES)
        if (await canEncodeVideo('avc', { width: size, height: size })) return { kind: 'webcodecs', size };
    } catch {
      // 次の方法へ
    }
  }
  if (typeof MediaRecorder !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype) {
    for (const mimeType of ['video/mp4;codecs=avc1.42E01F', 'video/mp4;codecs=avc1', 'video/mp4'])
      if (MediaRecorder.isTypeSupported(mimeType)) return { kind: 'mediarecorder', mimeType };
  }
  return null;
}

export interface ExportOptions {
  method: VideoMethod;
  plan: VideoPlan;
  meta: FrameMeta;
  palette: BoardPalette;
  onProgress: (ratio: number) => void;
  signal: AbortSignal;
}

function abortError(): DOMException {
  return new DOMException('canceled', 'AbortError');
}

export async function exportVideo(o: ExportOptions): Promise<Blob> {
  return o.method.kind === 'webcodecs'
    ? exportWithWebCodecs(o, o.method.size)
    : exportWithMediaRecorder(o, o.method.mimeType);
}

async function exportWithWebCodecs(o: ExportOptions, size: number): Promise<Blob> {
  const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, QUALITY_HIGH } = await import('mediabunny');
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const source = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: FPS });
  await output.start();
  const frames = Math.ceil((o.plan.durationMs / 1000) * FPS);
  try {
    for (let i = 0; i < frames; i++) {
      if (o.signal.aborted) throw abortError();
      drawVideoFrame(ctx, size, o.plan, o.meta, (i * 1000) / FPS, o.palette);
      await source.add(i / FPS, 1 / FPS);
      if (i % 10 === 0) o.onProgress(i / frames);
    }
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => undefined);
    throw e;
  }
  o.onProgress(1);
  return new Blob([target.buffer!], { type: 'video/mp4' });
}

async function exportWithMediaRecorder(o: ExportOptions, mimeType: string): Promise<Blob> {
  const size = 720;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  drawVideoFrame(ctx, size, o.plan, o.meta, 0, o.palette);
  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  recorder.start(1000);
  const t0 = performance.now();
  await new Promise<void>((resolve, reject) => {
    const step = () => {
      if (o.signal.aborted) {
        reject(abortError());
        return;
      }
      const t = performance.now() - t0;
      drawVideoFrame(ctx, size, o.plan, o.meta, Math.min(t, o.plan.durationMs), o.palette);
      o.onProgress(Math.min(1, t / o.plan.durationMs));
      if (t >= o.plan.durationMs) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }).finally(() => {
    if (recorder.state !== 'inactive') recorder.stop();
    for (const tr of stream.getTracks()) tr.stop();
  });
  await stopped;
  return new Blob(chunks, { type: mimeType.split(';')[0] });
}
