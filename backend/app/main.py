import asyncio
import logging
import shutil
import time
import uuid
from datetime import datetime
from http import HTTPStatus
from pathlib import Path

import mido
import numpy as np
import partitura
from fastapi import (
    BackgroundTasks,
    FastAPI,
    File,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from partitura.io.exportmidi import get_ppq
from starlette.websockets import WebSocketState

from .config import FRAME_RATE
from .oltw import OLTW
from .stream import AudioStream
from .utils import get_score_features

app = FastAPI()
origins = ["http://localhost:50003", "http://127.0.0.1:50003"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEFAULT_SCORE_FILE = "../resources/Happy_Birthday_To_You_C_Major.mid"
DEFAULT_PERFORMANCE_FILE = "../resources/ex_score_from_mid.wav"
current_position = 0


def run_score_following(score_file, performance_file):
    global current_position
    reference_features = get_score_features(score_file)
    alignment_in_progress = True

    score_obj = partitura.load_score_midi(score_file)
    tick = mido.MidiFile(score_file).ticks_per_beat
    start_time = time.time()
    elapsed_sec = 0
    current_position = 0
    try:
        while alignment_in_progress:
            with AudioStream() as stream:
                oltw = OLTW(reference_features, stream.queue)
                for current_frame in oltw.run():
                    current_position = np.round(
                        score_obj.parts[0].beat_map(
                            current_frame / FRAME_RATE * tick * 2
                        ),
                        decimals=2,
                    )
            alignment_in_progress = False
    except Exception as e:
        logging.error(f"Error: {e}")
        return {"error": str(e)}

    # while alignment_in_progress:
    #     interval = 0.1
    #     time.sleep(interval)
    #     elapsed_sec += interval
    #     current_position = np.round(
    #         score_obj.parts[0].beat_map(elapsed_sec * tick * 2), decimals=2
    #     )  # position in beat
    #     if np.isnan(current_position):
    #         current_position = 0
    #     if time.time() - start_time > 15:
    #         alignment_in_progress = False


@app.get("/")
async def root():
    return {"message": "Hello World"}


@app.patch(
    "/align",
    status_code=HTTPStatus.ACCEPTED,
    tags=["Interactive API"],
)
async def alignment(
    background_tasks: BackgroundTasks,
):

    # frame_index = np.searchsorted(onset_frames, current_frame, side="right") - 1
    background_tasks.add_task(
        run_score_following,
        score_file=DEFAULT_SCORE_FILE,
        performance_file=DEFAULT_PERFORMANCE_FILE,
    )

    return {"response": f"alignment task is running in the background"}


@app.post("/upload")
def upload_file(file: UploadFile = File(...)):
    file_id = str(uuid.uuid4())
    file_path = f"uploads/{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        # onset_beats = np.unique(
        #     partitura.musicxml_to_notearray(file_path)["onset_beat"]
        # ).tolist()
        score_obj = partitura.load_score_midi(DEFAULT_SCORE_FILE)
        onset_beats = np.unique(score_obj.note_array()["onset_beat"])
        tick = mido.MidiFile(DEFAULT_SCORE_FILE).ticks_per_beat

        onset_seconds = np.array(
            [score_obj.parts[0].inv_beat_map(beat) / (tick * 2) for beat in onset_beats]
        )
        onset_frames = (onset_seconds * FRAME_RATE).astype(int).tolist()
        onset_beats_rev = np.array(
            [score_obj.parts[0].beat_map(sec * tick * 2) for sec in onset_seconds]
        )
    except Exception as e:
        print(f"Error: {e}")
        return {"error": str(e)}

    print(f"ticks_per_beat: {get_ppq(score_obj.parts[0])}, tick: {tick}")
    print(f"onset_beats: {onset_beats}, {len(onset_beats)}")
    print(f"onset_seconds: {onset_seconds}, {len(onset_seconds)}")
    print(f"onset_frames: {onset_frames}, {len(onset_frames)}")
    print(f"onset_beats_rev: {onset_beats_rev}, {len(onset_beats_rev)}")
    print(f"onset_beats_rev same? {np.allclose(onset_beats, onset_beats_rev)}")

    return {
        "file_id": file_id,
        "filename": file.filename,
        "onset_beats": onset_beats.tolist(),
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    global current_position

    await websocket.accept()

    data = await websocket.receive_json()  # data: {"onset_beats": [0.5, 1, 1.5, ...]}
    print(f"Received data: {data}, {type(data)}")
    onset_beats = data["onset_beats"]

    try:
        while websocket.client_state == WebSocketState.CONNECTED:
            print(
                f"[{datetime.now().strftime('%H:%M:%S.%f')}] Current position: {current_position}"
            )
            beat_index = (
                np.searchsorted(onset_beats, current_position, side="right") - 1
            )
            # print(f"beat_index: {beat_index}")

            await websocket.send_json({"beat_position": current_position})
            await asyncio.sleep(0.1)

    except Exception as e:
        print(f"Websocket send data error: {e}, {type(e)}")
        current_position = 0
        return
