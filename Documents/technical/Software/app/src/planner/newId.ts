export function toBase62(value: number): string {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
        throw new Error(`Base62 input must be a finite non-negative integer: ${value}`);
    }

    if (value === 0) {
        return "0";
    }

    let remaining = value;
    let result = "";

    while (remaining > 0) {
        const digit = remaining % 62;
        result = resolveBase62Digit(digit) + result;
        remaining = Math.floor(remaining / 62);
    }

    return result;
}

export const newId = (() => {
    let lastNum: number | undefined;
    let suffixNum = 0;

    return function createId<TId extends string>(when: Date = new Date()): TId {
        const num = 5000000000000 - when.getTime();
        let result = toBase62(num);

        if (num === lastNum) {
            suffixNum += 1;
        } else {
            suffixNum = Math.floor(Math.random() * ((1073741824 + 536870912) / 2 - 536870912) + 536870912);
        }

        result += toBase62(suffixNum);
        lastNum = num;

        return result as TId;
    };
})();

function resolveBase62Digit(digit: number): string {
    if (digit >= 0 && digit <= 9) {
        return String.fromCharCode(48 + digit);
    }

    if (digit >= 10 && digit <= 35) {
        return String.fromCharCode(65 + digit - 10);
    }

    if (digit >= 36 && digit <= 61) {
        return String.fromCharCode(97 + digit - 36);
    }

    throw new Error(`Base62 digit out of range: ${digit}`);
}