import asyncio
import shutil
import uuid
from http import HTTPStatus

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

from .config import FRAME_RATE
from .helpers import run_score_following
from .oltw import OLTW
from .stream import AudioStream
from .utils import get_score_features

app = FastAPI()

# CORS 설정
origins = ["http://localhost:50003", "http://127.0.0.1:50003"]  # 프론트엔드 URL

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # 모든 도메인 허용, 필요에 따라 특정 도메인으로 변경 가능
    allow_credentials=True,
    allow_methods=["*"],  # 모든 HTTP 메서드 허용
    allow_headers=["*"],  # 모든 HTTP 헤더 허용
)

DEFAULT_SCORE_FILE = "../resources/midi_score.mid"
DEFAULT_PERFORMANCE_FILE = "../resources/LuoJ01M.wav"


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
    # background_tasks.add_task(
    #     run_score_following,
    #     score_file=DEFAULT_SCORE_FILE,
    #     performance_file=DEFAULT_PERFORMANCE_FILE,
    # )
    oltw, oltw.wp = run_score_following(DEFAULT_SCORE_FILE, DEFAULT_PERFORMANCE_FILE)

    return {"response": f"alignment task is running in the background"}


@app.post("/upload")
def upload_file(file: UploadFile = File(...)):
    file_id = str(uuid.uuid4())
    file_path = f"uploads/{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        onset_beats = np.unique(
            partitura.musicxml_to_notearray(file_path)["onset_beat"]
        ).tolist()
        score_obj = partitura.load_musicxml(file_path)
        midi_obj = partitura.save_score_midi(score_obj, out=False)
        tick = midi_obj.ticks_per_beat

        onset_seconds = np.array(
            [score_obj.parts[0].inv_beat_map(beat) / (tick * 2) for beat in onset_beats]
        )
        onset_frames = (onset_seconds * FRAME_RATE).astype(int).tolist()
    except Exception as e:
        print(f"Error: {e}")
        return {"error": str(e)}

    print(f"onset_beats: {onset_beats}")
    print(f"onset_seconds: {onset_seconds}")
    print(f"onset_frames: {onset_frames}")
    return {"file_id": file_id, "filename": file.filename, "onset_frames": onset_frames}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    data = await websocket.receive_json()  # data: {"onset_frames": [1, 2, 3, ...]}
    print(f"Received data: {data}")
    onset_frames = np.array(data.get("onset_frames", []))
    current_frame = 0

    reference_features = get_score_features(DEFAULT_SCORE_FILE)
    score_obj = partitura.load_score_midi(DEFAULT_SCORE_FILE)

    try:
        while True:
            with AudioStream(DEFAULT_PERFORMANCE_FILE) as stream:
                oltw = OLTW(reference_features, stream.queue)
                for current_frame in oltw.run():
                    frame_index = (
                        np.searchsorted(onset_frames, current_frame, side="right") - 1
                    )
                    if frame_index >= 0 and frame_index < len(onset_frames):
                        closest_frame = onset_frames[frame_index]
                        print(
                            f"Current frame {current_frame} is closest to frame {closest_frame} at index {frame_index}"
                        )

                    await websocket.send_json({"frame_index": int(frame_index)})

            # Simulate score following result
            # await asyncio.sleep(0.1)
            # current_frame += FRAME_RATE * 0.1

            # frame_index = np.searchsorted(onset_frames, current_frame, side="right") - 1
            # if frame_index >= 0 and frame_index < len(onset_frames):
            #     closest_frame = onset_frames[frame_index]
            #     print(
            #         f"Current frame {current_frame} is closest to frame {closest_frame} at index {frame_index}"
            #     )

            # await websocket.send_json({"frame_index": int(frame_index)})
    except WebSocketDisconnect:
        print("Client disconnected")
