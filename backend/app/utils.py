import logging
import traceback
from pathlib import Path

import librosa
import numpy as np
import partitura
import pyaudio
from matchmaker import Matchmaker
from partitura.io.exportmidi import get_ppq
from partitura.score import Score, Part

from .config import FRAME_RATE, HOP_LENGTH, N_FFT, SAMPLE_RATE
from .position_manager import position_manager


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

    if feature_type == "chroma":
        score_features = process_chroma(y, sr, HOP_LENGTH, N_FFT)
    elif feature_type == "chroma_decay":
        score_features = process_chroma_decay(y, sr, HOP_LENGTH, N_FFT)
    else:
        raise ValueError(f"Invalid feature type: {feature_type}")
    return score_features


def convert_beat_to_quarter(score_part: Part, current_beat: float) -> float:
    timeline_time = score_part.inv_beat_map(current_beat)
    quarter_position = score_part.quarter_map(timeline_time)
    return float(quarter_position)


def preprocess_score(score_xml: Path) -> None:
    """
    Preprocess the score xml file to midi and audio file

    Parameters
    ----------
    score_xml : Path
        Path to the score xml file
    """
    score_obj = partitura.load_musicxml(score_xml)

    score_midi_path = f"./uploads/{score_xml.stem}.mid"
    partitura.save_score_midi(score_obj, score_midi_path)

    score_audio_path = f"./uploads/{score_xml.stem}.wav"
    partitura.save_wav_fluidsynth(score_obj, score_audio_path)


def find_midi_by_file_id(file_id: str, directory: Path = Path("./uploads")) -> Path:
    for file in directory.iterdir():
        if file.is_file() and file.stem.startswith(file_id) and file.suffix == ".mid":
            return file
    return None


def get_audio_devices() -> list[dict]:
    """
    Get the list of audio devices available on the system
    The default device is always the first one in the list.

    Returns
    -------
    devices: list[dict]
        List of audio devices with index and name

    """
    try:
        p = pyaudio.PyAudio()
        device_count = p.get_device_count()
        default_device = p.get_default_input_device_info()
        devices = []
        for i in range(device_count):
            device_info = p.get_device_info_by_index(i)
            if device_info == default_device:
                continue
            devices.append({"index": device_info["index"], "name": device_info["name"]})
        devices.insert(
            0, {"index": default_device["index"], "name": default_device["name"]}
        )
        p.terminate()
    except Exception as e:
        logging.error(f"Error: {e}")
        devices = [{"index": 0, "name": "No audio devices found"}]
    return devices


def run_score_following(file_id: str, device: str) -> None:
    score_midi = find_midi_by_file_id(file_id)  # .mid
    score_part = partitura.load_score_as_part(score_midi)
    print(f"Running score following with {score_midi}")

    alignment_in_progress = True
    mm = Matchmaker(
        score_file=score_midi,
        input_type="audio",
        feature_type="chroma",
        method="arzt",
        device_name_or_index=device,
    )
    try:
        while alignment_in_progress:
            print("Running score following...")
            for current_position in mm.run():
                quarter_position = convert_beat_to_quarter(score_part, current_position)
                position_manager.set_position(file_id, quarter_position)
            alignment_in_progress = False
    except Exception as e:
        logging.error(f"Error: {e}")
        traceback.print_exc()
        return {"error": str(e)}
