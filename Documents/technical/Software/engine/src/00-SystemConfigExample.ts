// Draft Process map.
// This is a config for how the data is shaped by the planner to the animation 

export const config = {
    commandGroups: [
        {
            command: "claim/add",
            animations: [
                { type: "Structural graph change" },
                { type: "layout and claim" },
                { type: "empty pipe" },
                { type: "confidence fluid" },
                { type: "relevance pipe and junction" },
                { type: "relevance fluid" },
                { type: "junction shape" },
                { type: "confidence delivery" },
                { type: "Score propagation" },
                { type: "source and junction" },
                { type: "junction to target" },
                { type: "Incoming score sort" },
                { type: "Source scale update" },
            ],
        },
    ],
} as const;
