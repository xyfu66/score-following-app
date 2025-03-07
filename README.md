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

### With docker *recommend

```
$ docker build -t score-following-backend -f backend/Dockerfile .
```

## Setting Frontend environment

```bash
$ cd frontend/
$ npm install

# Create .env.local
$ echo "NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000" > .env.local
```

### With docker *recommend

```
$ docker build -t score-following-frontend -f frontend/Dockerfile .
```

## Running the app

```bash
$ cd backend/
$ ./start_app.sh  # Server will start at http://localhost:8000/
```

Note: The first server startup might take longer as it downloads required soundfonts from `partitura` library.

```bash
$ cd frontend/
$ npm start  # Client will start at http://localhost:50003/
```

### With docker *recommend

```
$ docker run -d -p 8000:8000 --name SF-BE-Container score-following-backend
$ docker run -d -p 50003:50003 --name SF-FE-Container score-following-frontend
```

Now you can access the app at `http://localhost:50003/` in your browser.

## Demo video

https://github.com/user-attachments/assets/a8010f8b-45a1-4be5-8cd1-f65a9601f8eb
