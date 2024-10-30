import logging
from pathlib import Path
import traceback

import librosa
import numpy as np
import partitura
import pyaudio
from matchmaker.dp import OnlineTimeWarpingDixon
from matchmaker.io.audio import AudioStream
from matchmaker import Matchmaker
from midi2audio import FluidSynth
from partitura.io.exportmidi import get_ppq
from partitura.score import Score
from partitura.io.exportaudio import save_wav_fluidsynth

from .config import FRAME_RATE, HOP_LENGTH, N_FFT, SAMPLE_RATE, SOUND_FONT_PATH
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


def convert_frame_to_beat(
    score_obj: Score, current_frame: int, frame_rate: int = FRAME_RATE
) -> float:
    """
    Convert frame number to absolute beat position in the score.
    For example, if the relative beat position is 0.5 and time signature is 12/8, we will return 0.5 * (4 / 8) = 0.25

    Parameters
    ----------
    score_obj : Score
        Partitura score object
    frame_rate : int
        Frame rate of the audio stream
    current_frame : int
        Current frame number
    """
    tick = get_ppq(score_obj.parts[0])
    timeline_time = (current_frame / frame_rate) * tick * 2
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


def run_score_following_backup(file_id: str) -> None:
    score_midi = find_midi_by_file_id(file_id)  # .mid
    print(f"Running score following with {score_midi}")

    reference_features = get_score_features(score_midi)
    alignment_in_progress = True

    score_obj = partitura.load_score_midi(score_midi)
    try:
        while alignment_in_progress:
            with AudioStream() as stream:
                otwd = OnlineTimeWarpingDixon(reference_features, stream.queue)
                for current_frame in otwd.run():
                    position_in_beat = convert_frame_to_beat(score_obj, current_frame)
                    position_manager.set_position(file_id, position_in_beat)

            alignment_in_progress = False
    except Exception as e:
        logging.error(f"Error: {e}")
        traceback.print_exc()
        return {"error": str(e)}


def run_score_following(file_id: str) -> None:
    score_midi = find_midi_by_file_id(file_id)  # .mid
    print(f"Running score following with {score_midi}")

    alignment_in_progress = True
    mm = Matchmaker(
        score_file=score_midi,
        input_type="audio",
        feature_type="chroma",
        method="dixon",
    )
    try:
        while alignment_in_progress:
            print("Running score following...")
            for current_position in mm.run():
                position_manager.set_position(file_id, current_position)
            alignment_in_progress = False
    except Exception as e:
        logging.error(f"Error: {e}")
        traceback.print_exc()
        return {"error": str(e)}
