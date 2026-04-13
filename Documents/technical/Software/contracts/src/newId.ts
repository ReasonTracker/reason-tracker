
// See 📌README.md in this folder for local coding standards before editing this file.

/**
 * Generate a short sequential unique-ish id
 * @param when for predictable ID generation for testing - The date to use for the id generation. Defaults to now. We suggest sending in custom IDs though.
 */
export const newId = (() => {
    let lastNum: number;
    let suffixNum = 0;

    return function (when: Date = new Date()): string {
        const num = 5000000000000 - when.getTime();
        let result = toBase62(num);

        if (num === lastNum) {
            suffixNum++
        } else {
            // Generate a random 30-bit number between 2^29 and 2^30 - 1 
            // which when converted to base 62 will always be 5 characters long
            // But leaves half the space for incrementing the suffix if the timestamp is the same
            suffixNum = Math.floor(Math.random() * ((1073741824 + 536870912) / 2 - 536870912) + 536870912);
        }

        // Add 5 extra semi-random characters in case multiple ids are creates at the same time
        result = result + toBase62(suffixNum);

        lastNum = num;

        return result;
    }
})();

export function toBase62(num: number) {
    const base62Chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let str = '';
    while (num > 0) {
        str = base62Chars[num % 62] + str;
        num = Math.floor(num / 62);
    }
    return str;
}


