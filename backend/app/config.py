CHANNELS = 1
SAMPLE_RATE = 44100
FRAME_RATE = 30
HOP_LENGTH = SAMPLE_RATE // FRAME_RATE
N_FFT = 2 * HOP_LENGTH
FEATURE_TYPE = "chroma"  # option: ["chroma", "chroma_decay"]
FRAME_PER_SEG = 1
SOUND_FONT_PATH = "~/soundfonts/sf2/MuseScore_General.sf2"

DEFAULT_SCORE_FILE = "../resources/ex_score_from_xml.mid"
DEFAULT_PERFORMANCE_FILE = "../resources/ex_score_from_mid.wav"
