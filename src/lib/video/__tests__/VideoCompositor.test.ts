
// Mocks para simular ambiente de navegador
class MockMediaRecorder {
    state = 'inactive';
    ondataavailable: any;
    onstop: any;
    onerror: any;

    constructor(stream: any, options: any) {}
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
(global as any).MediaRecorder = MockMediaRecorder;
(global as any).AudioContext = MockAudioContext;
(global as any).window = { AudioContext: MockAudioContext };
(global as any).document = {
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
(global as any).navigator = {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
    platform: 'MacIntel',
    maxTouchPoints: 5
};

import { VideoCompositor } from '../VideoCompositor';

describe('VideoCompositor', () => {
    let compositor: VideoCompositor;
    let mockVideo: any;

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
            addEventListener: (ev: string, cb: any) => {
                if (ev === 'seeked') setTimeout(cb, 0);
            },
            removeEventListener: () => {},
            requestVideoFrameCallback: (cb: any) => {
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
        // @ts-ignore
        const mime = compositor['getBestMimeType']();
        expect(mime).toContain('video/mp4');
    });

    it('deve limpar recursos ao cancelar', () => {
        compositor.cancel();
        // Verifica se não lança erro
        expect(true).toBe(true);
    });
});
