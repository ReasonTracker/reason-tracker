import type { EpisodeScriptSpecInput } from "../shared/episodeScriptSpec";

const episode = {
	schemaVersion: 3,
	settings: {
		composition: {
			id: "Episode0001",
			fps: 60,
			width: 1920,
			height: 1080,
		},
		defaults: {
			"camera.move": {
				duration: 2,
			},
		},
	},
	script: [
		{
			type: "media.add",
			key: "sunshineProtectionAct",
			offsetSeconds: 2,
			source: "media/sunshine-protection-act.png",
			layout: {
				x: 1020,
				y: 460,
				width: 100,
			},
			style: {
				zIndex: -1,
			},
			blocking: false,
		},
		{
			type: "media.update",
			key: "sunshineProtectionAct",
			offsetSeconds: 3,
			layout: {
				y: 370,
			},
			duration: 0.75,
			blocking: false,
		},
		{
			type: "media.update",
			key: "sunshineProtectionAct",
			offsetSeconds: 8,
			layout: {
				y: 460,
			},
			style: {
				opacity: "0",
			},
			duration: 0.75,
			blocking: false,
		},
		{
			type: "camera.cut",
			target: {
				offsetSeconds: 7,
				objects: [
					"argumentGraph/main",
				],
				"zoom%": 70,
				"x%": 0,
				"y%": -10,
			},
			blocking: false,
		},
		{
			type: "graph.create",
			key: "argumentGraph",
			layout: {
				x: 960,
				y: 540,
			},
			hideScores: true,
			scoreboard: {
				x: 5,
				y: 5,
				height: 300,
				thermometerWidth: 100,
				numberWidth: 170,
			},
			mainClaim: {
				key: "main",
				text: "The United States would benefit overall from enacting the Sunshine Protection Act to establish permanent Daylight Saving Time all year long.",
				textReveal: true,
			},
			claims: [],
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 4,
				objects: [
					"argumentGraph/disruptsleep",
					"argumentGraph/main",
				],
			},
			blocking: true,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "disruptsleep",
			text: "The twice-yearly clock changes disrupt sleep schedules.",
			target: "main",
			side: "pro",
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 4,
				objects: [
					"argumentGraph/implementationCosts",
					"argumentGraph/main",
				],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "implementationCosts",
			text: "$500 million to $1 billion to implement the change was projected for the comparable 2007 U.S. daylight saving time rule change.",
			target: "main",
			side: "con",
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 4,
				objects: [
					"argumentGraph/oneTimeCost",
					"argumentGraph/main",
				],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "oneTimeCost",
			text: "There is a one-time cost associated with implementing the change but the benefits last for many years.",
			target: { relevanceOf: "implementationCosts" },
			side: "pro",
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 4,
				objects: [
					"argumentGraph/annualSavings",
					"argumentGraph/main",
				],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "annualSavings",
			text: "Saves Americans “hundreds of millions of dollars in value annually.",
			target: "main",
			side: "pro",
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 4,
				objects: [
					"argumentGraph/healthSafety",
					"argumentGraph/main",
				],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "healthSafety",
			text: "Ending seasonal clock changes would improve health and safety on balance.",
			target: "main",
			side: "pro",
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 4,
				objects: [
					"argumentGraph/heartAttackMetaAnalysis2024",
					"argumentGraph/healthSafety",
				],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "heartAttackMetaAnalysis2024",
			text: "A 2024 meta-analysis of 12 studies from 10 countries found about a 4% increase in myocardial infarction after the spring Daylight Saving Time transition.",
			target: "healthSafety",
			side: "pro",
		},
		// {
		// 	type: "camera.move",
		// 	target: {
		// 		offsetSeconds: 4,
		// 		objects: [
		// 			"argumentGraph/heartAttackReview2026",
		// 			"argumentGraph/healthSafety",
		// 		],
		// 	},
		// 	blocking: false,
		// },
		// {
		// 	type: "graph.addClaim",
		// 	graph: "argumentGraph",
		// 	key: "heartAttackReview2026",
		// 	text: "A 2026 systematic review of 157 epidemiological studies concluded that spring clock changes appear associated with increased myocardial infarction, citing the roughly 4% meta-analytic estimate. Its literature search ended June 19, 2025.",
		// 	target: "healthSafety",
		// 	side: "pro",
		// },
		{
			type: "camera.move",
			target: {
				offsetSeconds: 4,
				objects: [
					"argumentGraph/largeJamaHeartAttackStudy2025",
					"argumentGraph/healthSafety",
				],
				"zoom%": 70,
				"x%": -10,
				"y%": 0,
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "largeJamaHeartAttackStudy2025",
			text: "A 2025 U.S. study found no significant increase in myocardial infarction during Daylight Saving Time transition weeks.",
			target: "healthSafety",
			side: "con",
		},
		// {
		// 	type: "camera.move",
		// 	target: {
		// 		offsetSeconds: 4,
		// 		objects: [
		// 			"argumentGraph/largeJamaStudySize",
		// 			"argumentGraph/largeJamaHeartAttackStudy2025",
		// 			"argumentGraph/healthSafety",
		// 		],
		// 	},
		// 	blocking: false,
		// },
		// {
		// 	type: "graph.addClaim",
		// 	graph: "argumentGraph",
		// 	key: "largeJamaStudySize",
		// 	text: "The 2025 U.S. study included 168,870 myocardial infarction patients at 1,124 hospitals and was published after both the 2024 meta-analysis and the June 19, 2025 search cutoff of the 2026 review, so neither included it.",
		// 	target: { relevanceOf: "largeJamaHeartAttackStudy2025" },
		// 	side: "con",
		// },
		{
			type: "camera.move",
			target: {
				objects: [
					"argumentGraph",
				],
			},
			blocking: true,
		},
		{ type: "wait", duration: 10 }
	],
} satisfies EpisodeScriptSpecInput;

export default episode;