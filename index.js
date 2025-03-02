const {Worker, isMainThread, parentPort} = require('worker_threads');
const StellarSdk = require('stellar-sdk');

const numThreads = 8;
const updateRate = 12500;
const prefix = "GCAT";
const suffix = "LIDIA";

function generateVanityAddress(prefix = "", suffix = "", id) {
    let attempts = 0;
    const startTime = Date.now();
    while (true) {
        attempts++;
        const keypair = StellarSdk.Keypair.random();
        const address = keypair.publicKey();

        if (address.startsWith(prefix) && address.endsWith(suffix)) {
            parentPort.postMessage({
                id,
                attempts,
                address,
                secret: keypair.secret()
            });
            break;
        }

        if (attempts % updateRate === 0) {
            const elapsedTime = (Date.now() - startTime) / 1000;
            const generationSpeed = attempts / elapsedTime;
            parentPort.postMessage({
                id,
                attempts,
                generationSpeed,
                elapsedTime
            });
        }
    }
}

function calculateVanityAddressStats(prefixLength, suffixLength, generationSpeed, currentAttempts) {
    const base = 32;
    const totalLength = prefixLength + suffixLength;
    const probability = Math.pow(base, -totalLength);
    const expectedAttempts = Math.pow(base, totalLength);
    const timeInSeconds = expectedAttempts / generationSpeed;
    const timeInHours = timeInSeconds / (60 * 60);
    return {
        formattedProbability: (probability * 100).toFixed(15),
        expectedAttempts,
        formattedTimeInHours: timeInHours.toFixed(1),
        progress: ((currentAttempts / expectedAttempts) * 100).toFixed(5)
    };
}

if (isMainThread) {
    const threads = [];
    const threadAttempts = Array(numThreads).fill(0);
    const started = Date.now();
    let totalGenerationSpeed = 0;

    for (let id = 0; id < numThreads; id++) {
        const worker = new Worker(__filename);
        worker.on('message', (msg) => {
            if (msg.address) {
                process.stdout.cursorTo(0, numThreads + 9);
                console.log(`Публичный ключ: ${msg.address}`);
                console.log(`Приватный ключ: ${msg.secret}`);
                console.log(`Завершено`, (Date.now() - started) / 1000);
                process.exit();
            }

            if (msg.attempts) {
                threadAttempts[msg.id] = msg.attempts;
                let threadAttemptsCount = threadAttempts.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
                totalGenerationSpeed = threadAttemptsCount / ((Date.now() - started) / 1000); // Рассчитываем общую скорость генерации

                let stats = calculateVanityAddressStats(prefix.length, suffix.length, totalGenerationSpeed, threadAttemptsCount);

                process.stdout.cursorTo(0, 2);
                process.stdout.write(`Сложность: ${stats.expectedAttempts.toLocaleString()} адресов`);

                process.stdout.cursorTo(0, 3);
                process.stdout.write(`Вероятность: ${stats.formattedProbability}%`);

                process.stdout.cursorTo(0, 4);
                process.stdout.write(`Ожидаемое время (часы): ${stats.formattedTimeInHours} ч.`);

                process.stdout.cursorTo(0, 5);
                process.stdout.write(`Общие попытки: ${threadAttemptsCount.toLocaleString()}`);

                process.stdout.cursorTo(0, 6);
                process.stdout.write(`Прогресс: ${stats.progress}%`);

                process.stdout.cursorTo(0, 7);
                process.stdout.write(`Время (секунды): ${msg.elapsedTime.toLocaleString()}`);

                process.stdout.cursorTo(0, 8);
                process.stdout.write(`Скорость генерации (адреса / сек): ${parseInt((threadAttemptsCount / msg.elapsedTime)).toLocaleString()}`);

                process.stdout.cursorTo(0, 10 + msg.id);
                process.stdout.write(`Поток ${msg.id + 1}: ${msg.attempts.toLocaleString()}`);
            }
        });

        worker.postMessage({prefix, suffix, id});
        threads.push(worker);
    }
} else {
    parentPort.on('message', (msg) => {
        generateVanityAddress(msg.prefix, msg.suffix, msg.id);
    });
}