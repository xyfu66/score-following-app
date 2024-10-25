# score-following-app

This is a simple score following app that reads a score file (MusicXML) and displays the aligned position in real-time using an Audio/MIDI input device. For the core alignment algorithm, we use the a `matchmaker`, python library for real-time music alignment. (ISMIR 2024 Late Breaking Demo)

## Pre-requisites

We use `midi2audio` in the preprocessing step to convert MIDI files to WAV files. This requires a soundfont file to be installed. You can download the soundfont file from the following link and place it in the `soundfonts/sf2` directory as below:

```bash
mkdir -p ~/soundfonts/sf2
wget ftp://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf2 ~/soundfonts/sf2/
```

Install fluidsynth as a dependency for the `midi2audio` package.

```bash
$ sudo apt-get install fluidsynth  # (for Linux)
$ brew install fluidsynth  # (for MacOS)
```

## Setting Backend environment

Tested on Python 3.12 (conda)

```bash
$ cd backend/
$ conda env create -f environment.yml
$ conda activate sfa
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
