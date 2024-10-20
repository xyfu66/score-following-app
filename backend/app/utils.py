import librosa
import numpy as np
import pretty_midi

from .config import FRAME_RATE


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


def get_score_features(
    score_path: str, frame_rate: int = FRAME_RATE, feature_type: str = "chroma"
) -> np.ndarray:
    mid = pretty_midi.PrettyMIDI(score_path)
    chroma = mid.get_chroma(fs=frame_rate)
    chroma_norm = librosa.util.normalize(chroma)
    return chroma_norm.T  # (time, n_chroma)


def frame_to_beat(frame, frame_rate, tempo):
    return frame / frame_rate * 60 / tempo
