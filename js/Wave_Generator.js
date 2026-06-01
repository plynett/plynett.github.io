// Wave_Generator.js
// Added by Codex: Start boundary wave generator support.

export const GENERATED_BOUNDARY_WAVE_TEXTURE_CAPACITY = 4096;

const DEG_TO_RAD = Math.PI / 180.0;
const RAD_TO_DEG = 180.0 / Math.PI;
const TWO_PI = 2.0 * Math.PI;

const TMA_SPECTRAL_COEFFICIENTS = Object.freeze({
    gammaS: 3.3,
    spreadO: 50.0,
    directionStepDegrees: 5.0,
    directionalHalfRangeDegrees: 20.0,
    truncationRatio: 0.01,
    gravity: 9.81,
    frequencyCount: 100,
    frequencyStartFactor: 1.0 / 3.0,
    frequencyEndFactor: 3.0
});

let cachedTmaKey = null;
let cachedTmaResult = null;

function finiteOrDefault(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
}

function positiveOrDefault(value, fallback) {
    return Number.isFinite(value) && value > 0.0 ? value : fallback;
}

function toRadians(degrees) {
    return finiteOrDefault(degrees, 0.0) * DEG_TO_RAD;
}

function cloneWaveResult(waveResult) {
    return {
        numberOfWaves: waveResult.numberOfWaves,
        waveData: waveResult.waveData.map(row => row.slice())
    };
}

export function buildSineWaveData(calc_constants) {
    const waveHeight = finiteOrDefault(calc_constants.incident_wave_H, 0.0);
    const wavePeriod = positiveOrDefault(calc_constants.incident_wave_T, 10.0);
    const waveDirection = toRadians(calc_constants.incident_wave_direction);

    return { numberOfWaves: 1, waveData: [[0.5 * waveHeight, wavePeriod, waveDirection, 0.0]] };
}

export function buildTmaWaveData(calc_constants) {
    const waveHeight = finiteOrDefault(calc_constants.incident_wave_H, 0.0);
    const wavePeriod = positiveOrDefault(calc_constants.incident_wave_T, 10.0);
    const peakDirectionDegrees = finiteOrDefault(calc_constants.incident_wave_direction, 0.0);
    const geometry = getIncidentBoundaryGeometry(calc_constants);
    const cacheKey = buildTmaCacheKey(calc_constants, waveHeight, wavePeriod, peakDirectionDegrees, geometry);

    if (cacheKey == cachedTmaKey && cachedTmaResult) {
        return cloneWaveResult(cachedTmaResult);
    }

    const generatedWaveData = generateTmaComponents(waveHeight, wavePeriod, peakDirectionDegrees, geometry);
    const result = {
        numberOfWaves: generatedWaveData.length,
        waveData: generatedWaveData
    };

    cachedTmaKey = cacheKey;
    cachedTmaResult = cloneWaveResult(result);

    return result;
}

function buildTmaCacheKey(calc_constants, waveHeight, wavePeriod, peakDirectionDegrees, geometry) {
    return JSON.stringify({
        waveHeight,
        wavePeriod,
        peakDirectionDegrees,
        baseDepth: geometry.boundaryDepth,
        ds: geometry.ds,
        boundaryLength: geometry.boundaryLength,
        boundaryAngleDegrees: geometry.boundaryAngleDegrees,
        width: calc_constants.WIDTH,
        height: calc_constants.HEIGHT,
        dx: calc_constants.dx,
        dy: calc_constants.dy,
        westBoundaryType: calc_constants.west_boundary_type,
        eastBoundaryType: calc_constants.east_boundary_type,
        southBoundaryType: calc_constants.south_boundary_type,
        northBoundaryType: calc_constants.north_boundary_type
    });
}

function generateTmaComponents(waveHeight, wavePeriod, peakDirectionDegrees, geometry) {
    if (waveHeight == 0.0) {
        return [[0.0, wavePeriod, peakDirectionDegrees * DEG_TO_RAD, 0.0]];
    }

    const frequencies = buildFrequencyGrid(wavePeriod);
    const directions = buildDirectionGrid(peakDirectionDegrees);
    const directionalSpectra = buildDirectionalSpectra(waveHeight, wavePeriod, peakDirectionDegrees, frequencies, directions);
    const scaledSpectra = scaleDirectionalSpectraToInputHeight(directionalSpectra, waveHeight, frequencies.delF);
    const retainedSpectra = retainPeakFrequencies(scaledSpectra, directions);
    const retainedDelF = retainedSpectra.length > 1 ? retainedSpectra[1].frequency - retainedSpectra[0].frequency : frequencies.delF;
    const effectiveBoundaryLength = Math.max(0.0, geometry.boundaryLength - 2.0 * geometry.ds);
    const waveData = [];

    for (const spectrumRow of retainedSpectra) {
        for (let directionIndex = 0; directionIndex < directions.length; directionIndex++) {
            const componentEnergy = spectrumRow.directionalEnergies[directionIndex];
            const amplitude = Math.sqrt(Math.max(0.0, 2.0 * componentEnergy * retainedDelF));
            const correctedDirectionDegrees = fitDirectionToPeriodicBoundary(
                directions[directionIndex],
                spectrumRow.frequency,
                geometry.boundaryDepth,
                effectiveBoundaryLength,
                geometry.boundaryAngleDegrees
            );

            waveData.push([
                amplitude,
                1.0 / spectrumRow.frequency,
                correctedDirectionDegrees * DEG_TO_RAD,
                Math.random() * TWO_PI
            ]);
        }
    }

    return waveData.length > 0 ? waveData : [[0.0, wavePeriod, peakDirectionDegrees * DEG_TO_RAD, 0.0]];
}

function buildFrequencyGrid(wavePeriod) {
    const frequencyCount = TMA_SPECTRAL_COEFFICIENTS.frequencyCount;
    const peakFrequency = 1.0 / wavePeriod;
    const startFrequency = TMA_SPECTRAL_COEFFICIENTS.frequencyStartFactor * peakFrequency;
    const endFrequency = TMA_SPECTRAL_COEFFICIENTS.frequencyEndFactor * peakFrequency;
    const delF = (endFrequency - startFrequency) / Math.max(1, frequencyCount - 1);
    const values = [];

    for (let index = 0; index < frequencyCount; index++) {
        values.push(startFrequency + index * delF);
    }

    values.delF = delF;
    return values;
}

function buildDirectionGrid(peakDirectionDegrees) {
    const directions = [];
    const halfRange = TMA_SPECTRAL_COEFFICIENTS.directionalHalfRangeDegrees;
    const step = TMA_SPECTRAL_COEFFICIENTS.directionStepDegrees;
    const directionCount = Math.round((2.0 * halfRange) / step) + 1;

    for (let index = 0; index < directionCount; index++) {
        directions.push(peakDirectionDegrees - halfRange + index * step);
    }

    return directions;
}

function buildDirectionalSpectra(waveHeight, wavePeriod, peakDirectionDegrees, frequencies, directions) {
    const peakFrequency = 1.0 / wavePeriod;
    const spectrumRows = [];

    for (const frequency of frequencies) {
        const frequencyEnergy = calculateJonswapEnergy(frequency, peakFrequency, waveHeight);
        const directionWeights = calculateDirectionWeights(frequency, peakFrequency, peakDirectionDegrees, directions);

        spectrumRows.push({
            frequency,
            directionalEnergies: directionWeights.map(weight => frequencyEnergy * weight)
        });
    }

    return spectrumRows;
}

function calculateJonswapEnergy(frequency, peakFrequency, waveHeight) {
    const gammaS = TMA_SPECTRAL_COEFFICIENTS.gammaS;
    const beta = 0.0624 / (0.23 + 0.033 * gammaS - 0.185 / (1.9 + gammaS));
    const frequencyRatio = frequency / peakFrequency;
    const sigma = frequency <= peakFrequency ? 0.07 : 0.09;
    const frequencyRatioToFourth = Math.pow(frequencyRatio, 4.0);
    const gammaExponent = Math.exp(-Math.pow(frequencyRatio - 1.0, 2.0) / (2.0 * sigma * sigma));

    return beta * waveHeight * waveHeight / (frequency * frequencyRatioToFourth)
        * Math.exp(-1.25 / frequencyRatioToFourth)
        * Math.pow(gammaS, gammaExponent);
}

function calculateDirectionWeights(frequency, peakFrequency, peakDirectionDegrees, directions) {
    const frequencyRatio = frequency / peakFrequency;
    const spread = frequencyRatio < 1.0
        ? TMA_SPECTRAL_COEFFICIENTS.spreadO * Math.pow(frequencyRatio, 5.0)
        : TMA_SPECTRAL_COEFFICIENTS.spreadO * Math.pow(frequencyRatio, -2.5);
    const logBetaS = (2.0 * spread - 1.0) * Math.log(2.0) - Math.log(Math.PI)
        + 2.0 * logGamma(spread + 1.0) - logGamma(2.0 * spread + 1.0);
    const betaS = Math.exp(logBetaS);
    const weights = directions.map(directionDegrees => {
        const directionCosine = Math.max(0.0, Math.cos(0.5 * (directionDegrees - peakDirectionDegrees) * DEG_TO_RAD));
        return betaS * Math.pow(directionCosine, 2.0 * spread);
    });
    const weightSum = weights.reduce((sum, weight) => sum + weight, 0.0);

    if (weightSum <= 0.0) {
        const fallbackWeights = new Array(directions.length).fill(0.0);
        fallbackWeights[Math.round((directions.length - 1) / 2)] = 1.0;
        return fallbackWeights;
    }

    return weights.map(weight => weight / weightSum);
}

function scaleDirectionalSpectraToInputHeight(spectrumRows, waveHeight, delF) {
    let totalEnergy = 0.0;

    for (const spectrumRow of spectrumRows) {
        for (const componentEnergy of spectrumRow.directionalEnergies) {
            totalEnergy += componentEnergy * delF;
        }
    }

    const fullSpectrumHeight = Math.sqrt(Math.max(0.0, totalEnergy)) * 4.004;
    const scale = fullSpectrumHeight > 0.0 ? Math.pow(waveHeight / fullSpectrumHeight, 2.0) : 0.0;

    return spectrumRows.map(spectrumRow => ({
        frequency: spectrumRow.frequency,
        directionalEnergies: spectrumRow.directionalEnergies.map(componentEnergy => componentEnergy * scale)
    }));
}

function retainPeakFrequencies(spectrumRows, directions) {
    const centerDirectionIndex = Math.round((directions.length - 1) / 2);
    const maxCenterEnergy = spectrumRows.reduce((maxEnergy, spectrumRow) => {
        return Math.max(maxEnergy, spectrumRow.directionalEnergies[centerDirectionIndex]);
    }, 0.0);
    const threshold = TMA_SPECTRAL_COEFFICIENTS.truncationRatio * maxCenterEnergy;

    return spectrumRows.filter(spectrumRow => spectrumRow.directionalEnergies[centerDirectionIndex] > threshold);
}

function fitDirectionToPeriodicBoundary(directionDegrees, frequency, boundaryDepth, boundaryLength, boundaryAngleDegrees) {
    if (boundaryLength <= 0.0) {
        return directionDegrees;
    }

    const gravity = TMA_SPECTRAL_COEFFICIENTS.gravity;
    const omega = TWO_PI * frequency;
    const dispersionArgument = Math.max(0.0, omega * omega * boundaryDepth / gravity);
    const waveNumber = omega * omega / (gravity * Math.sqrt(Math.max(1.0e-12, Math.tanh(dispersionArgument))));
    const relativeWaveAngle = directionDegrees - boundaryAngleDegrees;
    const alongBoundaryWaveNumber = Math.sin(relativeWaveAngle * DEG_TO_RAD) * waveNumber;
    const alongBoundaryWavelength = TWO_PI / (1.0e-6 + alongBoundaryWaveNumber);
    const wavesAlongBoundary = Math.abs(boundaryLength / alongBoundaryWavelength);
    let correctedRelativeDirection = 0.0;

    if (wavesAlongBoundary >= 0.5) {
        let nearestIntegerWaves = Math.round(wavesAlongBoundary);
        const waveLength = TWO_PI / waveNumber;
        let nearestAlongBoundaryWavelength = boundaryLength / nearestIntegerWaves;

        if (nearestAlongBoundaryWavelength < waveLength) {
            nearestIntegerWaves -= 1;
            nearestAlongBoundaryWavelength = nearestIntegerWaves > 0.0 ? boundaryLength / nearestIntegerWaves : boundaryLength;
        }

        if (nearestIntegerWaves > 0.0) {
            const sineArgument = clamp(Math.sign(alongBoundaryWaveNumber) * (TWO_PI / nearestAlongBoundaryWavelength) / waveNumber, -1.0, 1.0);
            correctedRelativeDirection = Math.asin(sineArgument) * RAD_TO_DEG;
        }
    }

    return correctedRelativeDirection + boundaryAngleDegrees;
}

function getIncidentBoundaryGeometry(calc_constants) {
    const dx = positiveOrDefault(calc_constants.dx, 1.0);
    const dy = positiveOrDefault(calc_constants.dy, 1.0);
    const width = Math.max(1.0, positiveOrDefault(calc_constants.WIDTH, 1.0));
    const height = Math.max(1.0, positiveOrDefault(calc_constants.HEIGHT, 1.0));
    const boundaryDepth = positiveOrDefault(calc_constants.base_depth, 1.0);

    if (calc_constants.west_boundary_type == 2) {
        return { ds: dy, boundaryLength: Math.max(0.0, (height - 1.0) * dy), boundaryAngleDegrees: 0.0, boundaryDepth };
    }

    if (calc_constants.east_boundary_type == 2) {
        return { ds: dy, boundaryLength: Math.max(0.0, (height - 1.0) * dy), boundaryAngleDegrees: 180.0, boundaryDepth };
    }

    if (calc_constants.south_boundary_type == 2) {
        return { ds: dx, boundaryLength: Math.max(0.0, (width - 1.0) * dx), boundaryAngleDegrees: 90.0, boundaryDepth };
    }

    if (calc_constants.north_boundary_type == 2) {
        return { ds: dx, boundaryLength: Math.max(0.0, (width - 1.0) * dx), boundaryAngleDegrees: 270.0, boundaryDepth };
    }

    return { ds: dy, boundaryLength: Math.max(0.0, (height - 1.0) * dy), boundaryAngleDegrees: 0.0, boundaryDepth };
}

function clamp(value, minValue, maxValue) {
    return Math.min(maxValue, Math.max(minValue, value));
}

function logGamma(value) {
    const coefficients = [
        676.5203681218851,
        -1259.1392167224028,
        771.32342877765313,
        -176.61502916214059,
        12.507343278686905,
        -0.13857109526572012,
        9.9843695780195716e-6,
        1.5056327351493116e-7
    ];

    if (value < 0.5) {
        return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1.0 - value);
    }

    let shiftedValue = value - 1.0;
    let series = 0.99999999999980993;

    for (let index = 0; index < coefficients.length; index++) {
        series += coefficients[index] / (shiftedValue + index + 1.0);
    }

    const t = shiftedValue + coefficients.length - 0.5;
    return 0.5 * Math.log(2.0 * Math.PI) + (shiftedValue + 0.5) * Math.log(t) - t + Math.log(series);
}

// Added by Codex: End boundary wave generator support.
