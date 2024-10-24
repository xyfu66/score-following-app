# backend/Dockerfile
FROM continuumio/miniconda3

# Set the working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libportaudio2 \
    portaudio19-dev \
    fluidsynth \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Create soundfonts directory and download MuseScore_General.sf2
RUN mkdir -p ~/soundfonts/sf2 && \
    wget ftp://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf2 -P ~/soundfonts/sf2/

# Copy the environment file and install dependencies
COPY environment.yml .
RUN conda env create -f environment.yml

# Activate the environment and set the shell
SHELL ["conda", "run", "-n", "sfa", "/bin/bash", "-c"]

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 8000

# Command to run the backend server
CMD ["bash", "-c", "source activate sfa && ./start_app.sh"]