import type { EpisodeScriptSpecInput } from "../shared/episodeScriptSpec";

const episode = {
	schemaVersion: 4,
	settings: {
		composition: {
			id: "RelevanceTrapezoidExamples",
			fps: 60,
			width: 1920,
			height: 1080,
		},
	},
	script: [
		{
			type: "defaults.update",
			defaults: {
				"camera.move": {
					duration: 1.5,
				},
			},
		},
		{
			type: "graph.create",
			key: "argumentGraph",
			layout: {
				x: 960,
				y: 540,
			},
			mainClaim: {
				key: "main",
				text: "The city should convert Main Street into a car-free pedestrian zone.",
			},
			claims: [],
		},
		{
			type: "camera.cut",
			target: {
				objects: ["argumentGraph/main"],
				"zoom%": 70,
			},
		},
		{
			type: "captions.show",
			text: "Positive relevance: the trapezoid flares toward the claim it strengthens.",
			duration: 6,
			blocking: false,
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 2,
				objects: ["argumentGraph/footTraffic", "argumentGraph/main"],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "footTraffic",
			text: "Pedestrian zones increase foot traffic for local shops.",
			target: "main",
			side: "pro",
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 2,
				objects: ["argumentGraph/similarTowns", "argumentGraph/footTraffic"],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "similarTowns",
			text: "Towns with a similar layout saw the same increase.",
			target: { relevanceOf: "footTraffic" },
			side: "pro",
			defaultConfidence: 0.5,
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 2,
				objects: ["argumentGraph/shopSurvey", "argumentGraph/footTraffic"],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "shopSurvey",
			text: "A survey of shop owners expects more walk-in customers.",
			target: "footTraffic",
			side: "pro",
			defaultConfidence: 0.7,
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 2,
				objects: ["argumentGraph/onlineShopping", "argumentGraph/footTraffic"],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "onlineShopping",
			text: "More shoppers now buy online instead of walking between stores.",
			target: "footTraffic",
			side: "con",
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 2,
				objects: ["argumentGraph/cafeSeating", "argumentGraph/footTraffic"],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "cafeSeating",
			text: "Cafes could add outdoor seating that draws people in.",
			target: "footTraffic",
			side: "pro",
		},
		{ type: "wait", duration: 1.5 },
		{
			type: "captions.show",
			text: "Negative relevance: the trapezoid narrows the claim's delivery.",
			duration: 6,
			blocking: false,
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 2,
				objects: ["argumentGraph/deliveries", "argumentGraph/main"],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "deliveries",
			text: "Shops on Main Street depend on daytime truck deliveries.",
			target: "main",
			side: "con",
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 2,
				objects: ["argumentGraph/rearAlleys", "argumentGraph/deliveries"],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "rearAlleys",
			text: "Most shops already receive deliveries through rear alleys.",
			target: { relevanceOf: "deliveries" },
			side: "pro",
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 2,
				objects: ["argumentGraph/freshFood", "argumentGraph/deliveries"],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "freshFood",
			text: "Restaurants need several fresh-food deliveries every day.",
			target: "deliveries",
			side: "con",
			defaultConfidence: 0.6,
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 2,
				objects: ["argumentGraph/morningWindow", "argumentGraph/deliveries"],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "morningWindow",
			text: "Other pedestrian zones allow trucks in an early-morning delivery window.",
			target: "deliveries",
			side: "pro",
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 2,
				objects: ["argumentGraph/bulkStock", "argumentGraph/deliveries"],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "bulkStock",
			text: "Hardware and furniture stores receive heavy goods that cannot be carried by hand.",
			target: "deliveries",
			side: "con",
			defaultConfidence: 0.3,
		},
		{ type: "wait", duration: 1.5 },
		{
			type: "captions.show",
			text: "Several relevance claims: the trapezoid's slanted sides grow with their combined connector widths.",
			duration: 8,
			blocking: false,
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 2,
				objects: ["argumentGraph/safety", "argumentGraph/main"],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "safety",
			text: "Removing cars makes the street safer for pedestrians.",
			target: "main",
			side: "pro",
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 2,
				objects: ["argumentGraph/accidentData", "argumentGraph/safety"],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "accidentData",
			text: "Most pedestrian injuries in the city happen on streets like Main Street.",
			target: { relevanceOf: "safety" },
			side: "pro",
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 2,
				objects: ["argumentGraph/cyclists", "argumentGraph/safety"],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "cyclists",
			text: "Cyclists would still share the space with pedestrians.",
			target: { relevanceOf: "safety" },
			side: "con",
			defaultConfidence: 0.4,
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 2,
				objects: ["argumentGraph/crowdedSidewalks", "argumentGraph/safety"],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "crowdedSidewalks",
			text: "Main Street has the most crowded sidewalks in the city.",
			target: { relevanceOf: "safety" },
			side: "pro",
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 2,
				objects: ["argumentGraph/emergencyAccess", "argumentGraph/safety"],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "emergencyAccess",
			text: "Emergency vehicles would have a harder time reaching the street.",
			target: "safety",
			side: "con",
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 2,
				objects: ["argumentGraph/slowerTraffic", "argumentGraph/safety"],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "slowerTraffic",
			text: "Fewer cars means no fast-moving traffic near crowds.",
			target: "safety",
			side: "pro",
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 2,
				objects: ["argumentGraph/cityData", "argumentGraph/safety"],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "cityData",
			text: "Cities that closed streets to cars reported fewer pedestrian injuries.",
			target: "safety",
			side: "pro",
		},
		{ type: "wait", duration: 1.5 },
		{
			type: "captions.show",
			text: "Relevance claims stack with the confidence claims of the claim they affect.",
			duration: 8,
			blocking: false,
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 2,
				objects: ["argumentGraph/parking", "argumentGraph/main"],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "parking",
			text: "Visitors would lose convenient parking near the shops.",
			target: "main",
			side: "con",
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 2,
				objects: ["argumentGraph/garage", "argumentGraph/parking"],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "garage",
			text: "A public garage sits one block from Main Street.",
			target: "parking",
			side: "pro",
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 2,
				objects: ["argumentGraph/garageFull", "argumentGraph/parking"],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "garageFull",
			text: "The garage is often full on weekends.",
			target: "parking",
			side: "con",
			defaultConfidence: 0.5,
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 2,
				objects: ["argumentGraph/transitGap", "argumentGraph/parking"],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "transitGap",
			text: "There is no bus line serving Main Street.",
			target: "parking",
			side: "con",
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 2,
				objects: ["argumentGraph/olderVisitors", "argumentGraph/parking"],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "olderVisitors",
			text: "Many regular shoppers have limited mobility.",
			target: { relevanceOf: "parking" },
			side: "con",
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 2,
				objects: ["argumentGraph/reducedNoise", "argumentGraph/main"],
			},
			blocking: false,
		},
		{
			type: "graph.addClaim",
			graph: "argumentGraph",
			key: "reducedNoise",
			text: "A car-free street would reduce traffic noise for nearby residents.",
			target: "main",
			side: "pro",
			defaultConfidence: 0.6,
		},
		{
			type: "camera.move",
			target: {
				offsetSeconds: 1,
				objects: ["argumentGraph"],
				"zoom%": 90,
			},
			duration: 3,
			blocking: true,
		},
		{ type: "wait", duration: 6 },
	],
} satisfies EpisodeScriptSpecInput;

export default episode;
