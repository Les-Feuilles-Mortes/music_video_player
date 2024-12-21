import traceback
import pygame
import numpy as np
import pymunk  # 用于物理引擎
import imageio
from moviepy import VideoFileClip, AudioFileClip
import random
import math
import librosa
import os
from pydub import AudioSegment
import subprocess


AudioSegment.converter = r"C:\ProgramData\chocolatey\bin\ffmpeg.exe"

class MusicAnalyzer:
    def __init__(self, audio_path):
        # 检查并转换音频格式
        self.audio_path = self.convert_to_mp3(audio_path)
        # 加载音频文件
        self.y, self.sr = librosa.load(self.audio_path)
        # 获取音频时长
        self.duration = librosa.get_duration(y=self.y, sr=self.sr)
    
    def convert_to_mp3(self, audio_path):
        """
        如果是WAV格式，转换为MP3格式
        返回可用的音频文件路径
        """
        # 获取文件扩展名
        _, ext = os.path.splitext(audio_path)
        
        if ext.lower() == '.wav':
            try:
                # 构造新的MP3文件路径
                mp3_path = audio_path.rsplit('.', 1)[0] + '.mp3'
                
                # 如果MP3文件已存在，直接返回其路径
                if os.path.exists(mp3_path):
                    print(f"使用已存在的MP3文件: {mp3_path}")
                    return mp3_path
                
                print(f"正在将WAV转换为MP3: {audio_path}")
                print(f"输入文件是否存在: {os.path.exists(audio_path)}")
                print(f"输入文件大小: {os.path.getsize(audio_path)} bytes")
                
                # 使用 ffmpeg 直接转换来测试文件
                cmd = ['ffmpeg', '-i', audio_path, '-y', mp3_path]
                result = subprocess.run(cmd, capture_output=True, text=True)
                if result.returncode != 0:
                    print("FFmpeg 错误输出:")
                    print(result.stderr)
                    raise Exception(f"FFmpeg 转换失败: {result.stderr}")
                
                return mp3_path
                
            except Exception as e:
                print(f"转换音频格式时出错: {str(e)}")
                print(f"文件完整路径: {os.path.abspath(audio_path)}")
                raise
        
        return audio_path
        
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

class MusicVisualizer:
    def __init__(self, width=1920, height=1080, fps=60):
        pygame.init()
        self.width = width
        self.height = height
        self.fps = fps
        self.screen = pygame.display.set_mode((width, height))
        self.clock = pygame.time.Clock()
        
        # 初始化物理引擎
        self.space = pymunk.Space()
        self.space.gravity = (0, 900)  # 设置重力
        
        # 颜色定义
        self.colors = {
            'background': (26, 26, 26),
            'ball': (255, 255, 255),
            'board_colors': [
                (255, 59, 48),   # 红
                (255, 149, 0),   # 橙
                (255, 204, 0),   # 黄
                (76, 217, 100),  # 绿
                (88, 86, 214),   # 靛
                (0, 122, 255),   # 蓝
                (255, 105, 180)  # 粉
            ]
        }
        
        # 板子和小球的集合
        self.boards = []
        self.balls = []
        self.light_effects = []  # 存储光效
        
    def create_board(self, pos, size=(200, 20), angle=0):
        body = pymunk.Body(body_type=pymunk.Body.STATIC)
        body.position = pos
        body.angle = angle
        shape = pymunk.Segment(body, (-size[0]/2, 0), (size[0]/2, 0), size[1]/2)
        shape.elasticity = 0.8
        shape.friction = 0.5
        self.space.add(body, shape)
        self.boards.append({
            'shape': shape,
            'color': random.choice(self.colors['board_colors']),
            'glow': 0  # 发光强度
        })
        
    def create_ball(self, pos):
        mass = 1
        radius = 10
        moment = pymunk.moment_for_circle(mass, 0, radius)
        body = pymunk.Body(mass, moment)
        body.position = pos
        shape = pymunk.Circle(body, radius)
        shape.elasticity = 0.95
        shape.friction = 0.5
        self.space.add(body, shape)
        self.balls.append(shape)
        
    def add_light_effect(self, pos, color):
        self.light_effects.append({
            'pos': pos,
            'color': color,
            'radius': 0,
            'max_radius': 100,
            'alpha': 255
        })
        
    def update_light_effects(self):
        updated_effects = []
        for effect in self.light_effects:
            effect['radius'] += 2
            effect['alpha'] = max(0, effect['alpha'] - 5)
            if effect['alpha'] > 0:
                updated_effects.append(effect)
        self.light_effects = updated_effects
        
    def draw_light_effects(self):
        for effect in self.light_effects:
            surface = pygame.Surface((effect['radius']*2, effect['radius']*2), pygame.SRCALPHA)
            pygame.draw.circle(surface, (*effect['color'], effect['alpha']), 
                             (effect['radius'], effect['radius']), effect['radius'])
            self.screen.blit(surface, 
                           (effect['pos'][0]-effect['radius'], 
                            effect['pos'][1]-effect['radius']))

    def create_animation(self, music_analysis, output_path):
        writer = imageio.get_writer(output_path, fps=self.fps, codec='libx264', format='FFMPEG')
        
        # 初始化场景
        self.setup_scene()
        
        # 计算总帧数
        total_frames = int(music_analysis['duration'] * self.fps)
        
        for frame in range(total_frames):
            current_time = frame / self.fps
            
            # 处理音乐事件
            self.handle_music_events(current_time, music_analysis)
            
            # 更新物理引擎
            self.space.step(1/self.fps)
            
            # 清空屏幕
            self.screen.fill(self.colors['background'])
            
            # 更新和绘制光效
            self.update_light_effects()
            self.draw_light_effects()
            
            # 绘制板子和小球
            self.draw_scene()
            
            # 保存帧
            frame_data = pygame.surfarray.array3d(self.screen)
            frame_data = frame_data.swapaxes(0, 1)
            writer.append_data(frame_data)
            
            print(f"Rendering: {frame}/{total_frames} frames")
            
        writer.close()
        
        # 添加音频
        self.add_audio_to_video(output_path, music_analysis['audio_path'])
        
    def setup_scene(self):
        # 创建初始板子
        board_positions = [
            ((self.width//4, self.height//3), -0.2),
            ((self.width//2, self.height//2), 0.1),
            ((3*self.width//4, 2*self.height//3), 0.3),
            # 可以添加更多板子
        ]
        
        for pos, angle in board_positions:
            self.create_board(pos, angle=angle)
            
    def handle_music_events(self, current_time, music_analysis):
        # 在节拍点创建小球
        for beat_time in music_analysis['beat_times']:
            if abs(current_time - beat_time) < 1/self.fps:
                self.create_ball((random.randint(0, self.width), 0))
                
        # 检测碰撞并创建光效
        for ball in self.balls:
            for board in self.boards:
                if ball.body.position.y > self.height:
                    self.space.remove(ball, ball.body)
                    self.balls.remove(ball)
                    break
                    
                if ball.shapes_collide(board['shape']).points:
                    board['glow'] = 1.0
                    self.add_light_effect(
                        ball.body.position,
                        board['color']
                    )
                    
    def draw_scene(self):
        # 绘制板子
        for board in self.boards:
            shape = board['shape']
            p1 = shape.body.local_to_world(shape.a)
            p2 = shape.body.local_to_world(shape.b)
            pygame.draw.line(self.screen, board['color'], p1, p2, 10)
            
        # 绘制小球
        for ball in self.balls:
            pos = ball.body.position
            pygame.draw.circle(self.screen, self.colors['ball'], 
                             (int(pos.x), int(pos.y)), int(ball.radius))
                             
    def add_audio_to_video(self, video_path, audio_path):
        video = VideoFileClip(video_path)
        audio = AudioFileClip(audio_path)
        
        output_path = video_path.replace('.mp4', '_with_audio.mp4')
        print(f"视频时长: {video.duration}")
        print(f"音频时长: {audio.duration}")
        # 直接在写入时设置音频
        video.write_videofile(output_path, 
                             codec='libx264', 
                             audio=audio_path,  # 直接在这里设置音频
                             audio_codec='aac')
        
        # 清理资源
        video.close()
        audio.close()

def create_music_video(audio_path, output_path):
    # 确保输入文件存在
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"找不到音频文件: {audio_path}")
    
    # 分析音乐
    analyzer = MusicAnalyzer(audio_path)
    analysis = analyzer.analyze()
    # 将音频路径添加到分析结果中
    analysis['audio_path'] = analyzer.audio_path  # 添加这一行
    
    # 创建动画
    visualizer = MusicVisualizer()
    visualizer.create_animation(analysis, output_path)


if __name__ == "__main__":
    audio_path = "../data/music/有生之年.mp3"
    
    output_path = "../data/有生之年_video.mp4"
    try:
        create_music_video(audio_path, output_path)
    except Exception as e:
        print(f"处理过程中出错: {traceback.format_exc()}")
