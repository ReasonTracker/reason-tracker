// See 📌README.md in this folder for local coding standards before editing this file.

/**
 * Generate a short sequential unique-ish id.
 *
 * The optional date parameter exists only so tests can provide stable input.
 */
export const newId = (() => {
	let lastNum: number;
	let suffixNum = 0;

	return function (when: Date = new Date()): string {
		const num = 5000000000000 - when.getTime();
		let result = toBase62(num);

		if (num === lastNum) {
			suffixNum += 1;
		} else {
			suffixNum = Math.floor(Math.random() * ((1073741824 + 536870912) / 2 - 536870912) + 536870912);
		}

		result = result + toBase62(suffixNum);
		lastNum = num;
		return result;
	};
})();

export function toBase62(num: number): string {
	const base62Chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
	let result = "";

	while (num > 0) {
		result = base62Chars[num % 62] + result;
		num = Math.floor(num / 62);
	}

	return result;
}
