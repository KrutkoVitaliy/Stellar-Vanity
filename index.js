const { Worker, isMainThread, parentPort } = require('worker_threads');
const StellarSdk = require('stellar-sdk');

function generateVanityAddress(prefix = "", suffix = "", workerId) {
    let attempts = 0;
    const startTime = Date.now(); // Запускаем таймер
    while (true) {
        attempts++;
        const keypair = StellarSdk.Keypair.random();
        const address = keypair.publicKey();

        if (address.startsWith(prefix) && address.endsWith(suffix)) {
            parentPort.postMessage({
                workerId,
                attempts,
                address,
                secret: keypair.secret()
            });
            break;
        }

        if (attempts % 5000 === 0) {
            const elapsedTime = (Date.now() - startTime) / 1000; // Время в секундах
            const generationSpeed = attempts / elapsedTime; // Количество попыток в секунду
            parentPort.postMessage({
                workerId,
                attempts,
                generationSpeed
            });
        }
    }
}

// Функция для расчета вероятности, времени нахождения и прогресса
function calculateVanityAddressStats(prefixLength, suffixLength, generationSpeed, currentAttempts) {
    const base = 32; // Количество возможных символов в Stellar-адресе
    const totalLength = prefixLength + suffixLength;

    // Вычисляем вероятность нахождения нужного адреса
    const probability = Math.pow(base, -totalLength); // 1 / 32^(prefixLength + suffixLength)

    // Ожидаемое количество попыток
    const expectedAttempts = Math.pow(base, totalLength);

    // Время в секундах для нахождения адреса с учетом скорости генерации
    const timeInSeconds = expectedAttempts / generationSpeed;
    const timeInHours = timeInSeconds / (60 * 60);

    // Рассчитываем прогресс
    const progress = ((currentAttempts / expectedAttempts) * 100).toFixed(5);

    // Форматируем вероятность в проценты с 6 знаками после запятой
    const formattedProbability = (probability * 100).toFixed(15);

    // Форматируем время в часы с 2 знаками после запятой
    const formattedTimeInHours = timeInHours.toFixed(1);

    return {
        formattedProbability,
        expectedAttempts,
        formattedTimeInHours,
        progress
    };
}

if (isMainThread) {
    const numThreads = 10;
    const threads = [];
    const threadAttempts = Array(numThreads).fill(0);
    const started = Date.now();
    const prefix = "GCGZC";
    const suffix = "GZC";
    let totalGenerationSpeed = 0;

    for (let i = 0; i < numThreads; i++) {
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
                threadAttempts[msg.workerId] = msg.attempts;
                let threadAttemptsCount = threadAttempts.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
                totalGenerationSpeed = threadAttemptsCount / ((Date.now() - started) / 1000); // Рассчитываем общую скорость генерации

                let stats = calculateVanityAddressStats(prefix.length, suffix.length, totalGenerationSpeed, threadAttemptsCount);

                process.stdout.cursorTo(0, 8 + msg.workerId);
                process.stdout.write(`Поток ${msg.workerId + 1}: ${msg.attempts.toLocaleString()}`);

                process.stdout.cursorTo(0, 2);
                process.stdout.write(`Сложность: ${stats.expectedAttempts.toLocaleString()} адресов`);

                process.stdout.cursorTo(0, 3);
                process.stdout.write(`Вероятность: ${stats.formattedProbability}%`);

                process.stdout.cursorTo(0, 4);
                process.stdout.write(`Ожидаемое время: ${stats.formattedTimeInHours} ч.`);

                process.stdout.cursorTo(0, 5);
                process.stdout.write(`Общие попытки: ${threadAttemptsCount.toLocaleString()}`);

                process.stdout.cursorTo(0, 6);
                process.stdout.write(`Прогресс: ${stats.progress}%`);
            }
        });

        worker.postMessage({
            prefix: prefix,
            suffix: suffix,
            workerId: i
        });
        threads.push(worker);
    }
} else {
    parentPort.on('message', (msg) => {
        generateVanityAddress(msg.prefix, msg.suffix, msg.workerId);
    });
}