import {
	isPlainObject,
	validateEmittedTransactions,
	validateInputTransactions,
	validateStateShape
} from "./schema.js";

export function validateCase(testCase) {
	const errors = [];

	if (!isPlainObject(testCase)) {
		return ["Case must be an object."];
	}

	if (typeof testCase.id !== "string" || testCase.id.trim() === "") {
		errors.push("id must be a non-empty string.");
	}

	errors.push(...validateStateShape(testCase.state, "state"));
	errors.push(...validateInputTransactions(testCase.transactions));
	errors.push(...validateStateShape(testCase.expect_state, "expect_state"));
	errors.push(...validateEmittedTransactions(testCase.expect_emitted_transactions));

	return errors;
}
