from http import HTTPStatus

from fastapi import BackgroundTasks, FastAPI
from .helpers import run_score_following

app = FastAPI()

DEFAULT_SCORE_FILE = "../resources/ex_score.mid"
DEFAULT_PERFORMANCE_FILE = "../resources/ex_perf.wav"


@app.get("/")
async def root():
    return {"message": "Hello World"}


@app.patch(
    "/align",
    status_code=HTTPStatus.ACCEPTED,
    tags=["Interactive API"],
)
def alignment(
    background_tasks: BackgroundTasks,
):
    # background_tasks.add_task(
    #     run_score_following,
    #     score_file=DEFAULT_SCORE_FILE,
    #     performance_file=DEFAULT_PERFORMANCE_FILE,
    # )
    oltw, oltw.wp = run_score_following(DEFAULT_SCORE_FILE, DEFAULT_PERFORMANCE_FILE)

    return {"response": f"alignment task is running in the background"}
