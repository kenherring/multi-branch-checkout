FROM cimg/node:20.8

RUN sudo cp .circleci/sources.list /etc/apt/sources.list \
    && sudo apt update \
    && sudo apt -y install \
        gtk2-engines-pixbuf libasound2 libatk-bridge2.0-0 \
        libatk1.0-0 libgbm-dev libgtk-3-0 libnss3 xvfb \
    && sudo apt upgrade git -y \
    && sudo apt clean -y
