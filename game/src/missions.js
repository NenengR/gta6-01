import { clamp, distance, streetNameAt } from "./config.js";

export const MISSION_DEFINITIONS = [
  {
    id: "first-light",
    title: "First Light",
    subtitle: "A parcel before sunrise",
    story: "Meet Sol on Copa Way and take the marina ledger to its buyer.",
    briefing: [
      "Nia: Sol is waiting on Copa Way with a sealed parcel.",
      "Get the ledger to the buyer across town before the sun is up.",
    ],
    reward: 350,
    steps: [
      { type: "reach", x: 1080, y: 640, radius: 58, label: `Collect Sol's parcel on ${streetNameAt(1080, 640, "vertical")}` },
      { type: "reach", x: 1880, y: 1040, radius: 58, label: `Deliver the ledger on ${streetNameAt(1880, 1040, "vertical")}` },
    ],
  },
  {
    id: "borrowed-keys",
    title: "Borrowed Keys",
    subtitle: "Getaway driver",
    story: "A nervous racer needs a clean ride across town. Any car will do.",
    briefing: [
      "Nia: the racer owes me a favour, and her ride is being watched.",
      "Take any car with E, then drop her off Marina Road.",
    ],
    reward: 500,
    steps: [
      { type: "vehicle", label: "Take any car with E" },
      { type: "reach", x: 1880, y: 640, radius: 62, label: `Drop the racer on ${streetNameAt(1880, 640, "vertical")}`, requireVehicle: true },
    ],
  },
  {
    id: "paper-trail",
    title: "Paper Trail",
    subtitle: "Repo job",
    story: "Repossess Sol's cobalt coupe before its owner notices the call.",
    briefing: [
      "Nia: the cobalt coupe is tagged and parked near Sol Avenue.",
      "Bring it back to the lockup, quietly if you can.",
    ],
    reward: 700,
    steps: [
      { type: "vehicle", vehicleTag: "repo-car", label: "Steal the tagged cobalt coupe" },
      { type: "reach", x: 680, y: 1840, radius: 62, label: "Return the coupe to the lockup", requireVehicle: true },
    ],
  },
  {
    id: "red-current",
    title: "Red Current",
    subtitle: "Delivery under pressure",
    story: "The handoff is watched. Take the red case and stay ahead of the blue lights.",
    briefing: [
      "Nia: the red case is sitting on Sol Avenue.",
      "Grab it and reach the radio tower. Expect blue lights on the way.",
    ],
    reward: 950,
    steps: [
      { type: "reach", x: 1480, y: 1840, radius: 56, label: `Collect the red case on ${streetNameAt(1480, 1840, "vertical")}` },
      { type: "reach", x: 680, y: 640, radius: 62, label: "Deliver the case to the radio tower", requireVehicle: true, triggerWanted: 52, timeLimit: 52 },
    ],
  },
  {
    id: "gilded-room",
    title: "The Gilded Room",
    subtitle: "Final heist",
    story: "A museum trustee hid the original coastal deed. Steal the curator's car, recover it, and disappear.",
    briefing: [
      "Nia: the curator's sedan is marked near Sol Avenue.",
      "Use it to reach the Gilded Room on Dune Drive.",
      "Recover the deed, then lose the heat at the radio tower.",
    ],
    reward: 1800,
    steps: [
      { type: "vehicle", vehicleTag: "heist-car", label: "Take the curator's marked sedan" },
      { type: "reach", x: 2680, y: 640, radius: 66, label: `Reach the Gilded Room on ${streetNameAt(2680, 640, "vertical")}` },
      { type: "reach", x: 2680, y: 1840, radius: 66, label: "Recover the coastal deed" },
      { type: "reach", x: 680, y: 640, radius: 68, label: "Escape to the radio tower", requireVehicle: true, triggerWanted: 72, timeLimit: 78 },
    ],
  },
];

function findDefinition(id) {
  return MISSION_DEFINITIONS.find((mission) => mission.id === id) || null;
}

export function createMissionSystem() {
  return {
    completed: [],
    active: null,
    availableIndex: 0,
    lastMessage: "",
    lastMessageTimer: 0,
    failed: false,
  };
}

export function availableMission(missions) {
  return MISSION_DEFINITIONS[missions.availableIndex] || null;
}

// The radio prompt belongs only to the idle, unfinished state.
export function showRadioMarker(missions) {
  if (!missions || missions.active) return false;
  return missions.completed.length < MISSION_DEFINITIONS.length;
}

export function missionMarker(missions) {
  if (!showRadioMarker(missions)) return null;
  return { x: 680, y: 704, mission: availableMission(missions) };
}

export function activeMission(missions) {
  if (!missions.active) return null;
  const definition = findDefinition(missions.active.id);
  if (!definition) return null;
  const step = definition.steps[missions.active.stepIndex];
  if (!step) return null;
  return { ...definition, step, stepIndex: missions.active.stepIndex };
}

export function startMission(missions, id, stepIndex = 0) {
  const definition = findDefinition(id);
  if (!definition) return false;
  missions.active = { id, stepIndex, elapsed: 0, stepStartedAt: 0, triggered: false };
  missions.failed = false;
  return true;
}

function stepTimeLeft(missions, step) {
  if (!step.timeLimit) return null;
  return Math.max(0, step.timeLimit - (missions.active.elapsed - (missions.active.stepStartedAt || 0)));
}

function stepDone(step, player) {
  if (step.type === "reach") {
    const arrived = distance(player.x, player.y, step.x, step.y) <= step.radius;
    return arrived && (!step.requireVehicle || Boolean(player.vehicle));
  }
  if (step.type === "vehicle") {
    return Boolean(player.vehicle) && (!step.vehicleTag || player.vehicle.tag === step.vehicleTag);
  }
  return false;
}

function finishMission(missions, definition, events) {
  missions.completed.push(definition.id);
  missions.active = null;
  missions.availableIndex = Math.min(missions.availableIndex + 1, MISSION_DEFINITIONS.length - 1);
  missions.lastMessage = `${definition.title} complete — $${definition.reward}`;
  missions.lastMessageTimer = 4;
  events.onComplete(definition);
}

function abortMission(missions, message, events) {
  missions.failed = true;
  missions.lastMessage = message;
  missions.lastMessageTimer = 4;
  missions.active = null;
  events.failMission(message);
}

function triggerStepWanted(missions, step, events) {
  if (!step.triggerWanted || missions.active.triggered) return;
  missions.active.triggered = true;
  events.onWanted(step.triggerWanted);
}

export function updateMissions(missions, player, traffic, police, delta, now, events) {
  if (missions.lastMessageTimer > 0) missions.lastMessageTimer = Math.max(0, missions.lastMessageTimer - delta);
  if (!missions.active) return;

  const definition = findDefinition(missions.active.id);
  const step = definition.steps[missions.active.stepIndex];
  triggerStepWanted(missions, step, events);
  missions.active.elapsed += delta;

  if (step.timeLimit) {
    const remaining = step.timeLimit - (missions.active.elapsed - (missions.active.stepStartedAt || 0));
    if (remaining <= 0) {
      abortMission(missions, "The trail went cold.", events);
      return;
    }
  }

  if (!stepDone(step, player)) return;

  const finishedIndex = missions.active.stepIndex;
  missions.active.stepIndex += 1;
  missions.active.stepStartedAt = missions.active.elapsed;
  missions.active.triggered = false;
  if (missions.active.stepIndex < definition.steps.length) {
    triggerStepWanted(missions, definition.steps[missions.active.stepIndex], events);
  }
  events.onStep(definition, step, finishedIndex);

  if (missions.active.stepIndex >= definition.steps.length) {
    finishMission(missions, definition, events);
  }
  void traffic;
  void police;
  void now;
  void clamp;
}

export function resetMission(missions) {
  const mission = availableMission(missions);
  if (mission) startMission(missions, mission.id, 0);
}

export function missionObjective(missions) {
  const active = activeMission(missions);
  if (active) return active.step.label;
  const mission = availableMission(missions);
  return mission ? `Press E at Nia's radio: ${mission.title}` : "Coastal deed secured — city is yours";
}

export function missionTimeRemaining(missions) {
  if (!missions.active) return null;
  const definition = findDefinition(missions.active.id);
  if (!definition) return null;
  const step = definition.steps[missions.active.stepIndex];
  if (!step) return null;
  return stepTimeLeft(missions, step);
}
