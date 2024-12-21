class Piano {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.frequencies = this.generateFrequencies();
        this.recording = false;
        this.recordedNotes = [];
        this.startTime = 0;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.loadedAudio = null;
        this.setupAudioRecorder();
        this.init();
        this.initRecording();
        this.initFileLoader();

        // 添加键盘映射作为类的属性
        this.keyMap = {
            // 第3八度
            'z': 'C3', 'a': 'C#3', 'x': 'D3', 's': 'D#3', 'c': 'E3',
            'v': 'F3', 'f': 'F#3', 'b': 'G3', 'g': 'G#3', 'n': 'A3',
            'h': 'A#3', 'm': 'B3',

            // 第4八度
            ',': 'C4', 'j': 'C#4', '.': 'D4', 'k': 'D#4', '/': 'E4',
            'q': 'F4', '2': 'F#4', 'w': 'G4', '3': 'G#4', 'e': 'A4',
            '4': 'A#4', 'r': 'B4',

            // 第5八度
            't': 'C5', '6': 'C#5', 'y': 'D5', '7': 'D#5', 'u': 'E5',
            'i': 'F5', '9': 'F#5', 'o': 'G5', '0': 'G#5', 'p': 'A5',
            '-': 'A#5', '[': 'B5'
        };
        this.isPlaying = false;
        this.currentAudioSource = null;
        this.playStartTime = 0;
        this.pauseTime = 0;
        this.pendingAnimations = [];
        this.waveAnimation = new WaveAnimation();
    }


    generateFrequencies() {
        const frequencies = {};
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

        // 使用标准频率公式: fn = f0 * (2^(1/12))^n
        // 其中 f0 是A4的频率 (440Hz)
        const A4 = 440;

        for (let octave = 3; octave <= 5; octave++) {
            notes.forEach((note, index) => {
                // 计算与A4的半音距离
                const A4Index = notes.indexOf('A');
                const octaveDiff = octave - 4;
                const halfSteps = index - A4Index + (octaveDiff * 12);

                // 计算频率
                const freq = A4 * Math.pow(2, halfSteps / 12);
                frequencies[`${note}${octave}`] = freq;
            });
        }

        return frequencies;
    }

    init() {
        const allKeys = document.querySelectorAll('.key, .black-key');
        allKeys.forEach(key => {
            key.addEventListener('mousedown', () => {
                this.playNote(key.dataset.note);
                key.classList.add('active');
            });
            key.addEventListener('mouseup', () => {
                key.classList.remove('active');
            });
            key.addEventListener('mouseleave', () => {
                key.classList.remove('active');
            });
        });

        // 添加键盘按键的点击事件监听
        const keyboardKeys = document.querySelectorAll('.key-cap');
        keyboardKeys.forEach(key => {
            key.addEventListener('mousedown', () => {
                const keyValue = key.getAttribute('data-key');
                const note = this.getKeyFromKeyboard(keyValue);
                if (note) {
                    // 触发按键动画
                    key.classList.add('active');
                    // 查找并触发对应的钢琴键
                    const pianoKey = document.querySelector(`[data-note="${note}"]`);
                    if (pianoKey) {
                        pianoKey.classList.add('active');
                        this.playNote(note);
                    }
                }
            });

            key.addEventListener('mouseup', () => {
                const keyValue = key.getAttribute('data-key');
                const note = this.getKeyFromKeyboard(keyValue);
                key.classList.remove('active');
                if (note) {
                    const pianoKey = document.querySelector(`[data-note="${note}"]`);
                    if (pianoKey) {
                        pianoKey.classList.remove('active');
                    }
                }
            });

            key.addEventListener('mouseleave', () => {
                const keyValue = key.getAttribute('data-key');
                const note = this.getKeyFromKeyboard(keyValue);
                key.classList.remove('active');
                if (note) {
                    const pianoKey = document.querySelector(`[data-note="${note}"]`);
                    if (pianoKey) {
                        pianoKey.classList.remove('active');
                    }
                }
            });
        });

        // 添加键盘控制
        document.addEventListener('keydown', (e) => {
            if (e.repeat) return; // 防止按住键时重复触发
            const key = this.getKeyFromKeyboard(e.key);
            if (key) {
                const pianoKey = document.querySelector(`[data-note="${key}"]`);
                const keyboardKey = document.querySelector(`.key-cap[data-key="${e.key.toLowerCase()}"]`);

                if (pianoKey && !pianoKey.classList.contains('active')) {
                    this.playNote(key);
                    pianoKey.classList.add('active');
                }

                if (keyboardKey) {
                    keyboardKey.classList.add('active');
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            const key = this.getKeyFromKeyboard(e.key);
            if (key) {
                const pianoKey = document.querySelector(`[data-note="${key}"]`);
                const keyboardKey = document.querySelector(`.key-cap[data-key="${e.key.toLowerCase()}"]`);

                if (pianoKey) {
                    pianoKey.classList.remove('active');
                }

                if (keyboardKey) {
                    keyboardKey.classList.remove('active');
                }
            }
        });
    }

    getKeyFromKeyboard(key) {
        return this.keyMap[key.toLowerCase()];
    }

    setupAudioRecorder() {
        this.destinationNode = this.audioContext.createMediaStreamDestination();

        try {
            this.mediaRecorder = new MediaRecorder(this.destinationNode.stream);

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
        } catch (err) {
            console.error('设置音频录制器失败:', err);
        }
    }

    initRecording() {
        const recordBtn = document.getElementById('recordBtn');
        const playBtn = document.getElementById('playBtn');
        const saveBtn = document.getElementById('saveBtn');
        const statusText = document.getElementById('recordingStatus');
        const recordIcon = recordBtn.querySelector('.record-icon');

        recordBtn.addEventListener('click', () => {
            if (!this.recording) {
                this.recording = true;
                this.recordedNotes = [];
                this.startTime = Date.now();
                this.audioChunks = [];
                this.mediaRecorder.start();
                recordBtn.textContent = '停止';
                recordIcon.classList.add('recording');
                statusText.textContent = '录制中...';
                playBtn.disabled = true;
                saveBtn.disabled = true;
            } else {
                this.recording = false;
                this.mediaRecorder.stop();
                recordBtn.textContent = '录制';
                recordIcon.classList.remove('recording');
                statusText.textContent = `已录制 ${this.recordedNotes.length} 个音符`;
                playBtn.disabled = false;
                saveBtn.disabled = false;
            }
        });

        playBtn.addEventListener('click', () => {
            if (this.loadedAudio) {
                this.playLoadedAudio();
            } else {
                this.playRecording();
            }
        });

        saveBtn.addEventListener('click', () => {
            if (this.mediaRecorder && this.audioChunks.length > 0) {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                this.saveAudioFile(audioBlob);
            }
        });
    }

    initFileLoader() {
        const fileInput = document.getElementById('loadFile');
        const playBtn = document.getElementById('playBtn');
        const statusText = document.getElementById('recordingStatus');

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const arrayBuffer = await file.arrayBuffer();
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                this.loadedAudio = audioBuffer;

                // 进行音频分析以检测音符
                this.analyzeAudio(audioBuffer);

                statusText.textContent = '音频文件已加载';
                playBtn.disabled = false;
            } catch (err) {
                console.error('加载音频文件失败:', err);
                statusText.textContent = '加载音频文件失败';
            }
        });
    }

    async analyzeAudio(audioBuffer) {
        const offlineCtx = new OfflineAudioContext(
            audioBuffer.numberOfChannels,
            audioBuffer.length,
            audioBuffer.sampleRate
        );

        const source = offlineCtx.createBufferSource();
        source.buffer = audioBuffer;

        // 创建分析器节点
        const analyzer = offlineCtx.createAnalyser();
        analyzer.fftSize = 4096; // 增加FFT大小以提高频率分辨率
        analyzer.smoothingTimeConstant = 0.3; // 平滑处理
        analyzer.minDecibels = -90;
        analyzer.maxDecibels = -10;

        // 创建滤波器去除噪声
        const filter = offlineCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2000; // 根据钢琴音域调整
        filter.Q.value = 1;

        source.connect(filter);
        filter.connect(analyzer);
        analyzer.connect(offlineCtx.destination);

        const frequencyData = new Float32Array(analyzer.frequencyBinCount);
        const timeData = new Float32Array(analyzer.fftSize);

        source.start();

        // 进行离线渲染并分析
        await offlineCtx.startRendering();

        // 分析音频数据
        this.recordedNotes = await this.analyzeFrames(analyzer, audioBuffer, frequencyData, timeData);
    }

    async analyzeFrames(analyzer, audioBuffer, frequencyData, timeData) {
        const notes = [];
        const sampleRate = audioBuffer.sampleRate;
        const frameDuration = analyzer.fftSize / sampleRate;
        const totalFrames = Math.ceil(audioBuffer.length / analyzer.fftSize);

        const minFreq = this.frequencies['C3']; // 最低音频率
        const maxFreq = this.frequencies['B5']; // 最高音频率

        let isNoteOn = false;
        let currentNote = null;
        let noteStartTime = 0;
        let confidenceThreshold = 0.8;
        let energyThreshold = -50; // dB

        for (let frame = 0; frame < totalFrames; frame++) {
            const timeOffset = frame * frameDuration;
            analyzer.getFloatFrequencyData(frequencyData);
            analyzer.getFloatTimeDomainData(timeData);

            // 计算当前帧的能量
            const energy = this.calculateEnergy(timeData);

            // 使用自相关和FFT结合的方式检测基频
            const fundamentalFreq = this.detectFundamentalFrequency(
                frequencyData,
                timeData,
                sampleRate,
                minFreq,
                maxFreq
            );

            if (fundamentalFreq && energy > energyThreshold) {
                const noteInfo = this.identifyNote(fundamentalFreq);

                if (noteInfo.confidence > confidenceThreshold) {
                    if (!isNoteOn) {
                        isNoteOn = true;
                        currentNote = noteInfo.note;
                        noteStartTime = timeOffset * 1000; // 转换为毫秒
                    } else if (noteInfo.note !== currentNote) {
                        // 音符变化，记录前一个音符
                        notes.push({
                            note: currentNote,
                            time: noteStartTime,
                            duration: timeOffset * 1000 - noteStartTime
                        });
                        currentNote = noteInfo.note;
                        noteStartTime = timeOffset * 1000;
                    }
                }
            } else if (isNoteOn) {
                // 音符结束
                notes.push({
                    note: currentNote,
                    time: noteStartTime,
                    duration: timeOffset * 1000 - noteStartTime
                });
                isNoteOn = false;
                currentNote = null;
            }
        }

        return this.cleanupNotes(notes);
    }

    calculateEnergy(timeData) {
        let sum = 0;
        for (let i = 0; i < timeData.length; i++) {
            sum += timeData[i] * timeData[i];
        }
        return 10 * Math.log10(sum / timeData.length);
    }

    detectFundamentalFrequency(frequencyData, timeData, sampleRate, minFreq, maxFreq) {
        // 使用FFT峰值检测
        const peaks = this.findPeaks(frequencyData);

        // 使用自相关确认基频
        const autoCorrelation = this.computeAutoCorrelation(timeData);
        const autoCorrelationPeak = this.findAutoCorrelationPeak(
            autoCorrelation,
            sampleRate,
            minFreq,
            maxFreq
        );

        // 结合两种方法的结果
        return this.reconcileFrequencyEstimates(peaks, autoCorrelationPeak, sampleRate);
    }

    findPeaks(frequencyData) {
        const peaks = [];
        const minPeakHeight = -60; // dB

        for (let i = 2; i < frequencyData.length - 2; i++) {
            if (frequencyData[i] > minPeakHeight &&
                frequencyData[i] > frequencyData[i - 1] &&
                frequencyData[i] > frequencyData[i - 2] &&
                frequencyData[i] > frequencyData[i + 1] &&
                frequencyData[i] > frequencyData[i + 2]) {
                peaks.push({
                    index: i,
                    magnitude: frequencyData[i]
                });
            }
        }

        return peaks;
    }

    computeAutoCorrelation(timeData) {
        const correlation = new Float32Array(timeData.length);

        for (let lag = 0; lag < correlation.length; lag++) {
            let sum = 0;
            for (let i = 0; i < correlation.length - lag; i++) {
                sum += timeData[i] * timeData[i + lag];
            }
            correlation[lag] = sum;
        }

        return correlation;
    }

    findAutoCorrelationPeak(correlation, sampleRate, minFreq, maxFreq) {
        const maxLag = Math.floor(sampleRate / minFreq);
        const minLag = Math.ceil(sampleRate / maxFreq);
        let maxCorrelation = -Infinity;
        let peakLag = 0;

        for (let lag = minLag; lag <= maxLag; lag++) {
            if (correlation[lag] > maxCorrelation) {
                maxCorrelation = correlation[lag];
                peakLag = lag;
            }
        }

        return sampleRate / peakLag;
    }

    reconcileFrequencyEstimates(fftPeaks, autoCorrelationFreq, sampleRate) {
        // 将FFT峰值转换为频率
        const fftFrequencies = fftPeaks.map(peak =>
            (peak.index * sampleRate) / (2 * fftPeaks.length)
        );

        // 找到最接近自相关结果的FFT峰值
        let bestFreq = autoCorrelationFreq;
        let minDiff = Infinity;

        fftFrequencies.forEach(freq => {
            const diff = Math.abs(freq - autoCorrelationFreq);
            if (diff < minDiff) {
                minDiff = diff;
                bestFreq = freq;
            }
        });

        return bestFreq;
    }

    identifyNote(frequency) {
        let bestNote = null;
        let bestDiff = Infinity;
        let confidence = 0;

        for (const [note, noteFreq] of Object.entries(this.frequencies)) {
            const diff = Math.abs(frequency - noteFreq);
            const centDiff = 1200 * Math.log2(frequency / noteFreq);

            if (Math.abs(centDiff) < 50 && diff < bestDiff) { // 50 cents 容差
                bestDiff = diff;
                bestNote = note;
                confidence = 1 - Math.abs(centDiff) / 50;
            }
        }

        return {
            note: bestNote,
            confidence: confidence
        };
    }

    cleanupNotes(notes) {
        // 合并过于接近的音符
        const minNoteDuration = 50; // 最小音符持续时间（毫秒）
        const mergeThreshold = 30; // 合并阈值（毫秒）

        return notes.reduce((cleaned, note, index) => {
            if (index === 0) {
                return [note];
            }

            const prevNote = cleaned[cleaned.length - 1];
            const timeDiff = note.time - (prevNote.time + prevNote.duration);

            if (timeDiff < mergeThreshold && note.note === prevNote.note) {
                // 合并音符
                prevNote.duration = note.time + note.duration - prevNote.time;
            } else if (note.duration >= minNoteDuration) {
                cleaned.push(note);
            }

            return cleaned;
        }, []);
    }

    async playLoadedAudio() {
        const playBtn = document.getElementById('playBtn');
        const recordBtn = document.getElementById('recordBtn');
        const saveBtn = document.getElementById('saveBtn');
        const loadBtn = document.getElementById('loadFile');
        const btnText = playBtn.querySelector('.btn-text');
        const playIcon = playBtn.querySelector('.play-icon');

        if (!this.isPlaying) {
            // 开始播放
            this.isPlaying = true;
            btnText.textContent = '暂停';
            playIcon.classList.add('paused');

            // 禁用其他按钮
            recordBtn.disabled = true;
            saveBtn.disabled = true;
            loadBtn.disabled = true;

            // 创建新的音频源
            this.currentAudioSource = this.audioContext.createBufferSource();
            this.currentAudioSource.buffer = this.loadedAudio;
            this.currentAudioSource.connect(this.audioContext.destination);

            // 如果是从暂停状态恢复
            const startOffset = this.pauseTime;
            this.playStartTime = this.audioContext.currentTime - startOffset;

            // 开始播放音频
            this.currentAudioSource.start(0, startOffset);

            // 播放音符动画
            this.playNotesAnimation(startOffset);

            // 监听播放结束
            this.currentAudioSource.onended = () => {
                this.stopPlayback();
                // 确保在播放结束时重置图标
                btnText.textContent = '播放';
                playIcon.classList.remove('paused');
            };
        } else {
            // 暂停播放
            this.pausePlayback();
        }
    }

    pausePlayback() {
        if (this.currentAudioSource) {
            this.pauseTime = this.audioContext.currentTime - this.playStartTime;
            this.currentAudioSource.stop();
            this.currentAudioSource = null;
            this.isPlaying = false;

            // 更新按钮状态
            const playBtn = document.getElementById('playBtn');
            const btnText = playBtn.querySelector('.btn-text');
            const playIcon = playBtn.querySelector('.play-icon');
            btnText.textContent = '播放';
            playIcon.classList.remove('paused');

            // 停止所有正在进行的动画
            this.stopAllAnimations();
        }
    }

    stopPlayback() {
        this.isPlaying = false;
        this.currentAudioSource = null;
        this.pauseTime = 0;

        // 更新按钮状态
        const playBtn = document.getElementById('playBtn');
        const recordBtn = document.getElementById('recordBtn');
        const saveBtn = document.getElementById('saveBtn');
        const loadBtn = document.getElementById('loadFile');
        const btnText = playBtn.querySelector('.btn-text');
        const playIcon = playBtn.querySelector('.play-icon');

        btnText.textContent = '播放';
        playIcon.classList.remove('paused');
        recordBtn.disabled = false;
        saveBtn.disabled = false;
        loadBtn.disabled = false;

        // 停止所有正在进行的动画
        this.stopAllAnimations();
    }

    stopAllAnimations() {
        // 清除所有活跃的按键状态
        document.querySelectorAll('.key.active, .black-key.active, .key-cap.active').forEach(key => {
            key.classList.remove('active');
        });
        // 清除所有待执行的动画定时器
        this.pendingAnimations.forEach(timer => clearTimeout(timer));
        this.pendingAnimations = [];
    }

    playNotesAnimation(startOffset = 0) {
        this.pendingAnimations = [];

        // 播放检测到的音符的可视化效果
        for (const note of this.recordedNotes) {
            if (note.time < startOffset) continue;

            const timer = setTimeout(() => {
                // 查找钢琴键和键盘按键
                const pianoKey = document.querySelector(`[data-note="${note.note}"]`);
                const keyboardKey = document.querySelector(`.key-cap[data-key="${this.getKeyboardKeyForNote(note.note)}"]`);

                // 计算动画持续时间
                const animationDuration = Math.min(Math.max(note.duration, 100), 500);

                // 激活钢琴键
                if (pianoKey) {
                    pianoKey.classList.add('active');
                    this.playNote(note.note);
                    setTimeout(() => {
                        pianoKey.classList.remove('active');
                    }, animationDuration);
                }

                // 激活键盘按键
                if (keyboardKey) {
                    keyboardKey.classList.add('active');
                    setTimeout(() => {
                        keyboardKey.classList.remove('active');
                    }, animationDuration);
                }
            }, note.time - startOffset);

            this.pendingAnimations.push(timer);
        }
    }

    getKeyboardKeyForNote(note) {
        // 从类的属性中查找对应的键
        for (const [key, mappedNote] of Object.entries(this.keyMap)) {
            if (mappedNote === note) {
                return key;
            }
        }
        return null;
    }

    saveAudioFile(audioBlob) {
        const url = URL.createObjectURL(audioBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `piano-recording-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    recordNote(note) {
        if (this.recording) {
            const time = Date.now() - this.startTime;
            this.recordedNotes.push({
                note,
                time
            });
        }
    }

    async playRecording() {
        const playBtn = document.getElementById('playBtn');
        const recordBtn = document.getElementById('recordBtn');
        const saveBtn = document.getElementById('saveBtn');

        playBtn.disabled = true;
        recordBtn.disabled = true;
        saveBtn.disabled = true;

        for (let i = 0; i < this.recordedNotes.length; i++) {
            const note = this.recordedNotes[i];
            const nextNote = this.recordedNotes[i + 1];

            // 播放当前音符
            this.playNote(note.note);

            // 显示当前正在播放的琴键
            const pianoKey = document.querySelector(`[data-note="${note.note}"]`);
            if (pianoKey) {
                pianoKey.classList.add('active');
                setTimeout(() => {
                    pianoKey.classList.remove('active');
                }, 100);
            }

            if (nextNote) {
                // 等待到下一个音符的时间
                await new Promise(resolve => setTimeout(resolve, nextNote.time - note.time));
            }
        }

        playBtn.disabled = false;
        recordBtn.disabled = false;
        saveBtn.disabled = false;
    }

    playNote(note) {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
    
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        if (this.recording) {
            gainNode.connect(this.destinationNode);
        }
    
        oscillator.type = 'sine';
        oscillator.frequency.value = this.frequencies[note];
    
        gainNode.gain.setValueAtTime(0.5, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 1);
    
        // 触发波浪动画，传入音符和强度
        const frequency = this.frequencies[note];
        const intensity = Math.min((frequency - 100) / 1000, 1);
        this.waveAnimation.triggerWave(note, intensity);
        
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 1);
        this.recordNote(note);
    }
}


class WaveAnimation {
    constructor() {
        this.canvas = document.getElementById('waveCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.waves = [];
        
        // 创建7条线，每条对应一个音符
        const noteColors = {
            'C': '#FF3B30', // Do - 红色
            'D': '#FF9500', // Re - 橙色
            'E': '#FFCC00', // Mi - 黄色
            'F': '#4CD964', // Fa - 绿色
            'G': '#5856D6', // So - 靛色
            'A': '#007AFF', // La - 蓝色
            'B': '#FF69B4'  // Xi - 粉色
        };
        
        // 为每个音符创建一条线
        Object.entries(noteColors).forEach(([note, color], i) => {
            this.waves.push({
                note: note,
                y: (this.canvas.height / 8) * (i + 1),
                color: color,
                points: [],
                baseY: 0
            });
        });

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.animate();
    }

    // ... resize 方法保持不变 ...

    // 修改触发波动的方法，只触发对应音符的线条
    triggerWave(note, intensity) {
        // 提取音符的基础音名（去掉八度数字）
        const baseNote = note.charAt(0);
        
        const wavePoint = {
            x: this.canvas.width,
            amplitude: intensity * 50,
            speed: 3,
            frequency: 0.03,
            phase: 0
        };

        // 只为对应的音符线条添加波动点
        const wave = this.waves.find(w => w.note === baseNote);
        if (wave) {
            wave.points.push({
                ...wavePoint,
                y: wave.baseY
            });
        }
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // 重新计算每条线的基准位置
        this.waves.forEach((wave, i) => {
            wave.baseY = (this.canvas.height / 8) * (i + 1);
            wave.y = wave.baseY;
        });
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.waves.forEach(wave => {
            this.ctx.beginPath();
            this.ctx.strokeStyle = wave.color;
            this.ctx.lineWidth = 2;
            
            // 绘制基准线
            this.ctx.moveTo(0, wave.baseY);
            
            // 计算每个像素的y值
            for (let x = 0; x < this.canvas.width; x++) {
                let y = wave.baseY;
                
                // 计算所有波动点对当前x位置的影响
                wave.points.forEach(point => {
                    const distance = x - point.x;
                    if (distance >= -200 && distance <= 200) {
                        // 使用高斯函数创造平滑的波动
                        const gaussian = Math.exp(-(distance * distance) / 2000);
                        y += Math.sin(point.frequency * distance + point.phase) 
                             * point.amplitude * gaussian;
                    }
                });
                
                this.ctx.lineTo(x, y);
            }
            
            this.ctx.stroke();
            
            // 更新波动点的位置和状态
            wave.points = wave.points.filter(point => {
                point.x -= point.speed;
                point.phase += 0.05;
                return point.x > -200; // 当波动点移出屏幕时移除
            });
        });
        
        requestAnimationFrame(() => this.animate());
    }
}
// 初始化钢琴
const piano = new Piano(); 