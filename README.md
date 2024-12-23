# score-following-app

This is a simple score following app that reads a score file (MusicXML) and displays the aligned position in real-time using an Audio/MIDI input device. For the core alignment algorithm, we use the a [pymatchmaker](https://github.com/pymatchmaker/matchmaker), python library for real-time music alignment. (ISMIR 2024 Late Breaking Demo)

## Pre-requisites

- Available Python version: 3.9 (other versions will be supported soon!)
- [Fluidsynth](https://www.fluidsynth.org/)
- [PortAudio](https://www.portaudio.com/)

```bash
# Linux
$ sudo apt-get install fluidsynth && sudo apt-get install portaudio19-dev

# MacOS
$ brew install fluidsynth && brew install portaudio
```

## Setting Backend environment

Tested on Python 3.9 (conda)

```bash
$ cd backend/
$ conda create -n sfa python=3.9
$ conda activate sfa
$ pip install -r requirements.txt
```

## Setting Frontend environment

```bash
$ cd frontend/
$ npm install

# Create .env.local
$ echo "NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000" > .env.local
```

## Running the app

```bash
$ cd backend/
$ ./start_app.sh  # Server will start at http://localhost:8000/
```

```bash
$ cd frontend/
$ npm start  # Client will start at http://localhost:50003/
```

Now you can access the app at `http://localhost:50003/` in your browser.
