// ── Global state ─────────────────────────────────────────────────────────────
const API = 'http://localhost:8766';
let session       = null;
let currentIndex  = 0;
let difficulty    = 'mid';
let serverOk      = false;
let ollamaOk      = false;

let mediaRecorder = null;
let audioChunks   = [];
let isRecording   = false;
let audioCtx      = null;
let analyser      = null;
let animFrame     = null;
let questionAudio = null;
let questionPlaying = false;

const _hintLoaded = {};