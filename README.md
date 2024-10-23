# score-following-app


## Setting Backend environment

Tested on Python 3.12 (conda)

```bash
$ cd backend/
$ conda env create -f environment.yml
$ conda activate sfa
```
### Install soundfont for fluidsynth

```bash
mkdir -p ~/soundfonts/sf2
wget ftp://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf2 ~/soundfonts/sf2/
```

## Setting Frontend environment

```bash
$ cd frontend/
$ npm install
```

## Running the app

```bash
$ cd backend/
$ ./start_app.sh
```

```bash
$ cd frontend/
$ npm start
```
