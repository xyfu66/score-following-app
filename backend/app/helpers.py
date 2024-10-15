from datetime import datetime

from .oltw import OLTW
from .stream import AudioStream
from .utils import get_score_features


def run_score_following(score_file, performance_file):
    reference_features = get_score_features(score_file)

    with AudioStream(file_path=performance_file) as stream:
        oltw = OLTW(reference_features, stream.queue)
        for current_position in oltw.run():
            print(
                f"[{datetime.now().strftime('%H:%M:%S.%f')}] Current position: {current_position}"
            )

    return oltw, oltw.warping_path
