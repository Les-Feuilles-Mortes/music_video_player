import librosa
import numpy as np

class MusicAnalyzer:
    def __init__(self, audio_path):
        # 加载音频文件
        self.y, self.sr = librosa.load(audio_path)
        # 获取音频时长
        self.duration = librosa.get_duration(y=self.y, sr=self.sr)
        
    def analyze(self):
        # 获取节拍信息
        tempo, beat_frames = librosa.beat.beat_track(y=self.y, sr=self.sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=self.sr)
        
        # 获取音频强度
        onset_env = librosa.onset.onset_strength(y=self.y, sr=self.sr)
        onset_frames = librosa.onset.onset_detect(onset_envelope=onset_env, sr=self.sr)
        onset_times = librosa.frames_to_time(onset_frames, sr=self.sr)
        
        # 获取频谱
        stft = librosa.stft(self.y)
        spectrogram = np.abs(stft)
        
        # 获取音高
        pitches, magnitudes = librosa.piptrack(y=self.y, sr=self.sr)
        
        # 获取和弦变化
        chroma = librosa.feature.chroma_stft(y=self.y, sr=self.sr)
        
        return {
            'tempo': tempo,
            'beat_times': beat_times,
            'onset_times': onset_times,
            'onset_strength': onset_env,
            'spectrogram': spectrogram,
            'pitches': pitches,
            'magnitudes': magnitudes,
            'chroma': chroma,
            'duration': self.duration
        } 