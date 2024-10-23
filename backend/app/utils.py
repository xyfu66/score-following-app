from pathlib import Path

import librosa
import numpy as np
import partitura
import pretty_midi
from partitura.io.exportmidi import get_ppq
from partitura.score import Score

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
    score_path: Path, frame_rate: int = FRAME_RATE, feature_type: str = "chroma"
) -> np.ndarray:
    mid = pretty_midi.PrettyMIDI(str(score_path))
    chroma = mid.get_chroma(fs=frame_rate)
    chroma_norm = librosa.util.normalize(chroma)
    return chroma_norm.T  # (time, n_chroma)

    fs = FluidSynth(SOUND_FONT_PATH, sample_rate=sr)
    fs.midi_to_audio(score_midi_path, score_audio_path)


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


def convert_musicxml_to_midi(score_xml: Path, midi_path: Path) -> None:
    score_obj = partitura.load_musicxml(score_xml)
    partitura.save_score_midi(score_obj, midi_path)


def find_midi_by_file_id(file_id: str, directory: Path = Path("./uploads")) -> Path:
    for file in directory.iterdir():
        if file.is_file() and file.stem.startswith(file_id) and file.suffix == ".mid":
            return file
    return None
