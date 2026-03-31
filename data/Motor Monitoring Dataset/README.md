# Датасет для обучения/предикта аномалий

Данный датасет представляет записи о работе мотора насосной установки. Записи представлены в виде фреймов по 15 сек. Для обучения `isolation forest` требуется датасет уже с выбросами/аномалиями. Для обучения рекомендуется использовать `healthy noise` с `window size = 1000 - 500` и `contamination = 0.01 - 0.005`.

## Описание датасета

Motor Current and Vibration Monitoring Dataset for various Faults in an E-motor-driven Centrifugal Pump

Authors: S. Bruinsma, R.D. Geertsma, R. Loendersloot, T. Tinga
Royal Netherlands Navy, Netherlands Defence Academy, University of Twente; Applied Mechanics
Corresponding author: sj.bruinsma.01@mindef.nl


Introduction

This dataset contains experimental vibration and motor current and voltage data of an electric motor pump set up, 
acquired at Fieldlab Techport as part of a research effort of the Royal Netherlands Navy.
The experiments consist of measurements with a wide variety of faults, distributed over 2 set ups.
One setup was operated at three different speeds, the other setup was operated at a single speed.
The majority of faults were applied in multiple levels of severity.
The file folder structure segments the measurements per measurement method, per set up, per speed and finally per fault and severity level.
The .csv file name contains this folder break-down and is further separated per measurement channel.

Supplementary reports and overviews are in a separate folder to the dataset.
The overview (measurement_overview.xlsx) contains motor speed, fluid flow and discharge pressure for each implemented fault.
Furthermore, there are folders containing balancing reports of the impellers and alignment reports. Datasheets of the electric motor pumps are added as well.
The dataset itself is compressed using the builtin windows tool 7z. The compressed dataset requires 90 GB of free harddisk space.

Data explanation

Vibration data was collected by five Wilcoxon 786B-10 100 mV/g single axis accelerometers on:
Channel 1: Electric Motor non-driven end bearing horizontal
Channel 2: Electric Motor driven end bearing vertical
Channel 3: Electric Motor driven end bearing axial
Channel 4: Pump driven end bearing horizontal
Channel 5: Pump non-driven end bearing vertical
Sample rate is set to 20 kHz. All data is in g, the first column is the measurement time in seconds.
Each sample is 12 seconds. 

Current and voltage data was collected using three CR Magnetics CR3110 current clamps and three Wago 855 voltage taps respectively.
The first three channels concern the current of the three phases, the last three channels concern the voltage of those three phases.
The sample rate is set to 20 kHz, the current is stored in A, the voltage is stored in V. The first column is the measurement time in seconds.
Each sample is 15 seconds.


Licensing - CC0 
 
## Ссылки на статью о датасете и на сам датасет 

Для установки необходимо минимум 90 гб памяти на диске 

[link to full data](https://data.4tu.nl/datasets/2b61183e-c14f-4131-829b-cc4822c369d0/4)

[link to Article](https://www.sciencedirect.com/science/article/pii/S235234092301017X?via%3Dihub#tbl0003)

