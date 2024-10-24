from pathlib import Path

import librosa
import numpy as np
import partitura
from partitura.io.exportmidi import get_ppq
from partitura.score import Score
from midi2audio import FluidSynth
import pyaudio

from .config import FRAME_RATE, HOP_LENGTH, N_FFT, SAMPLE_RATE, SOUND_FONT_PATH


def process_chroma(y, sr, hop_length, n_fft) -> np.ndarray:
    chroma = librosa.feature.chroma_stft(
        y=y,
        sr=sr,
        hop_length=hop_length,
        n_fft=n_fft,
        center=False,
    )
    return chroma.T  # (time, n_chroma)


def process_chroma_decay(y, sr, hop_length, n_fft) -> np.ndarray:
    chroma = librosa.feature.chroma_stft(
        y=y,
        sr=sr,
        hop_length=hop_length,
        n_fft=n_fft,
        center=False,
    )
    diff = np.diff(chroma, axis=0, prepend=chroma[0:1, :])
    half_wave_rectification = np.maximum(diff, 0)
    return half_wave_rectification.T  # (time, n_chroma)


def get_score_features(score_path: Path, feature_type: str = "chroma") -> np.ndarray:
    score_audio_path = score_path.with_suffix(".wav")
    y, sr = librosa.load(score_audio_path, sr=SAMPLE_RATE)
    return librosa.feature.chroma_stft(y=y, sr=sr, hop_length=HOP_LENGTH, n_fft=N_FFT).T


def convert_frame_to_beat(score_obj: Score, current_frame: int) -> float:
    tick = get_ppq(score_obj.parts[0])
    timeline_time = (current_frame / FRAME_RATE) * tick * 2
    beat_position = np.round(
        score_obj.parts[0].beat_map(timeline_time),
        decimals=2,
    )
    nominator, denominator, _ = score_obj.parts[0].time_signature_map(timeline_time)
    ratio = 4 / denominator  # 1/4 note as a unit
    return beat_position * ratio


def preprocess_score(score_xml: Path) -> None:
    """
    Preprocess the score xml file to midi and audio file

    Parameters
    ----------
    score_xml : Path
        Path to the score xml file
    """
    score_midi_path = f"./uploads/{score_xml.stem}.mid"
    score_obj = partitura.load_musicxml(score_xml)
    partitura.save_score_midi(score_obj, score_midi_path)

    score_audio_path = f"./uploads/{score_xml.stem}.wav"
    fs = FluidSynth(SOUND_FONT_PATH, sample_rate=SAMPLE_RATE)
    fs.midi_to_audio(score_midi_path, score_audio_path)
    return score_midi_path, score_audio_path


def find_midi_by_file_id(file_id: str, directory: Path = Path("./uploads")) -> Path:
    for file in directory.iterdir():
        if file.is_file() and file.stem.startswith(file_id) and file.suffix == ".mid":
            return file
    return None


def get_audio_devices():
    p = pyaudio.PyAudio()
    device_count = p.get_device_count()
    devices = []
    for i in range(device_count):
        device_info = p.get_device_info_by_index(i)
        devices.append(
            {
                "index": device_info["index"],
                "name": device_info["name"],
                "maxInputChannels": device_info["maxInputChannels"],
                "maxOutputChannels": device_info["maxOutputChannels"],
                "defaultSampleRate": device_info["defaultSampleRate"],
            }
        )
    p.terminate()
    return devices
