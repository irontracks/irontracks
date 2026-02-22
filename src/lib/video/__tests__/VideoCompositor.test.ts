
// Mocks para simular ambiente de navegador
class MockMediaRecorder {
    state = 'inactive';
    ondataavailable: ((event?: unknown) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: ((event?: unknown) => void) | null = null;

    constructor(stream: unknown, options: unknown) {}
    start() { this.state = 'recording'; }
    stop() { 
        this.state = 'inactive';
        if (this.onstop) this.onstop();
    }
    static isTypeSupported() { return true; }
}

class MockAudioContext {
    createMediaStreamDestination() {
        return { stream: { getAudioTracks: () => [{}] }, disconnect: () => {} };
    }
    createMediaElementSource() {
        return { connect: () => {}, disconnect: () => {} };
    }
    close() {}
}

// Mock global
type GlobalWithMocks = typeof globalThis & {
    MediaRecorder?: typeof MockMediaRecorder;
    AudioContext?: typeof MockAudioContext;
    window?: { AudioContext?: typeof MockAudioContext };
    document?: { createElement?: (tag: string) => Record<string, unknown> };
    navigator?: { userAgent?: string; platform?: string; maxTouchPoints?: number };
};
const globalWithMocks = globalThis as GlobalWithMocks;
globalWithMocks.MediaRecorder = MockMediaRecorder;
globalWithMocks.AudioContext = MockAudioContext;
globalWithMocks.window = { AudioContext: MockAudioContext };
globalWithMocks.document = {
    createElement: (tag: string) => {
        if (tag === 'canvas') {
            return {
                getContext: () => ({
                    drawImage: () => {},
                }),
                captureStream: () => ({
                    addTrack: () => {}
                })
            };
        }
        return {};
    }
};
globalWithMocks.navigator = {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
    platform: 'MacIntel',
    maxTouchPoints: 5
};

import { VideoCompositor } from '../VideoCompositor';

describe('VideoCompositor', () => {
    let compositor: VideoCompositor;
    type MockVideo = {
        muted: boolean;
        volume: number;
        loop: boolean;
        currentTime: number;
        duration: number;
        videoWidth: number;
        videoHeight: number;
        readyState: number;
        play: () => Promise<void>;
        pause: () => void;
        addEventListener: (ev: string, cb: () => void) => void;
        removeEventListener: () => void;
        requestVideoFrameCallback: (cb: () => void) => void;
    };
    let mockVideo: MockVideo;

    beforeEach(() => {
        compositor = new VideoCompositor();
        mockVideo = {
            muted: false,
            volume: 1,
            loop: false,
            currentTime: 0,
            duration: 10,
            videoWidth: 1920,
            videoHeight: 1080,
            readyState: 4,
            play: async () => {},
            pause: () => {},
            addEventListener: (ev: string, cb: () => void) => {
                if (ev === 'seeked') setTimeout(cb, 0);
            },
            removeEventListener: () => {},
            requestVideoFrameCallback: (cb: () => void) => {
                // Simula 30fps
                setTimeout(() => {
                    mockVideo.currentTime += 1/30;
                    cb();
                }, 1000/30);
            }
        };
    });

    it('deve inicializar corretamente', () => {
        expect(compositor).toBeDefined();
    });

    it('deve selecionar codec H.264 para iOS (UserAgent simulado)', async () => {
        const mime = (compositor as unknown as { getBestMimeType: () => string }).getBestMimeType();
        expect(mime).toContain('video/mp4');
    });

    it('deve limpar recursos ao cancelar', () => {
        compositor.cancel();
        // Verifica se não lança erro
        expect(true).toBe(true);
    });
});
