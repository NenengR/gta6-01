import { clamp, distance } from "./config.js";

export const MISSION_DEFINITIONS = [
  {
    id: "first-light",
    title: "First Light",
    subtitle: "A parcel before sunrise",
    story: "Meet Sol at Mercado Street and take the marina ledger to its buyer.",
    reward: 350,
    steps: [
      { type: "reach", x: 1080, y: 640, radius: 58, label: "Collect Sol's parcel at Mercado Street" },
      { type: "reach", x: 1880, y: 1040, radius: 58, label: "Deliver the ledger to Copa Way" },
    ],
  },
  {
    id: "borrowed-keys",
    title: "Borrowed Keys",
    subtitle: "Getaway driver",
    story: "A nervous racer needs a clean ride across town. Any car will do.",
    reward: 500,
    steps: [
      { type: "vehicle", label: "Take any car with E" },
      { type: "reach", x: 1880, y: 640, radius: 62, label: "Drop the racer at Sunset Drive", requireVehicle: true },
    ],
  },
  {
    id: "paper-trail",
    title: "Paper Trail",
    subtitle: "Repo job",
    story: "Repossess Sol's cobalt coupe before its owner notices the call.",
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
    reward: 950,
    steps: [
      { type: "reach", x: 1480, y: 1840, radius: 56, label: "Collect the red case on Mango Avenue" },
      { type: "reach", x: 680, y: 640, radius: 62, label: "Deliver the case to the radio tower", requireVehicle: true, triggerWanted: 52, timeLimit: 52 },
    ],
  },
  {
    id: "gilded-room",
    title: "The Gilded Room",
    subtitle: "Final heist",
    story: "A museum trustee hid the original coastal deed. Steal the curator's car, recover it, and disappear.",
    reward: 1800,
    steps: [
      { type: "vehicle", vehicleTag: "heist-car", label: "Take the curator's marked sedan" },
      { type: "reach", x: 2680, y: 640, radius: 66, label: "Reach the Gilded Room at Marina Road" },
      { type: "reach", x: 2680, y: 1840, radius: 66, label: "Recover the coastal deed" },
      { type: "reach", x: 680, y: 640, radius: 68, label: "Escape to the radio tower", requireVehicle: true, triggerWanted: 72, timeLimit: 78 },
    ],
  },
];

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

export function missionMarker(missions) {
  const mission = availableMission(missions);
  return mission ? { x: 680, y: 704, mission } : null;
}

export function activeMission(missions) {
  if (!missions.active) return null;
  const definition = MISSION_DEFINITIONS.find((mission) => mission.id === missions.active.id);
  if (!definition) return null;
  const step = definition.steps[missions.active.stepIndex];
  return { ...definition, step, stepIndex: missions.active.stepIndex };
}

export function startMission(missions, id, stepIndex = 0) {
  const definition = MISSION_DEFINITIONS.find((mission) => mission.id === id);
  if (!definition) return false;
  missions.active = { id, stepIndex, elapsed: 0 };
  missions.failed = false;
  return true;
}

export function updateMissions(missions, player, traffic, police, delta, now, events) {
  if (missions.lastMessageTimer > 0) missions.lastMessageTimer = Math.max(0, missions.lastMessageTimer - delta);
  if (!missions.active) return;

  const definition = MISSION_DEFINITIONS.find((mission) => mission.id === missions.active.id);
  const step = definition.steps[missions.active.stepIndex];
  missions.active.elapsed += delta;

  if (step.timeLimit) {
    const remaining = step.timeLimit - (missions.active.elapsed - (step.startedAt || 0));
    if (remaining <= 0) {
      failMission(missions, "The trail went cold.");
      return;
    }
  }

  let complete = false;
  if (step.type === "reach") {
    complete = distance(player.x, player.y, step.x, step.y) <= step.radius
      && (!step.requireVehicle || Boolean(player.vehicle));
  } else if (step.type === "vehicle") {
    complete = Boolean(player.vehicle) && (!step.vehicleTag || player.vehicle.tag === step.vehicleTag);
  }

  if (!complete) return;
  if (step.triggerWanted && !step.triggered) {
    step.triggered = true;
    police.heat = clamp(Math.max(police.heat, step.triggerWanted), 0, 100);
    events.onWanted(step.triggerWanted);
  }
  events.onStep(definition, step, missions.active.stepIndex);
  missions.active.stepIndex += 1;

  if (missions.active.stepIndex >= definition.steps.length) {
    completeMission(missions, definition, events);
  }
}

function completeMission(missions, definition, events) {
  missions.completed.push(definition.id);
  missions.active = null;
  missions.availableIndex = Math.min(missions.availableIndex + 1, MISSION_DEFINITIONS.length - 1);
  missions.lastMessage = `${definition.title} complete — $${definition.reward}`;
  missions.lastMessageTimer = 4;
  events.onComplete(definition);
}

function failMission(missions, message) {
  missions.failed = true;
  missions.lastMessage = message;
  missions.lastMessageTimer = 4;
  missions.active = null;
  events.failMission(message);
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
  const definition = MISSION_DEFINITIONS.find((mission) => mission.id === missions.active.id);
  const step = definition.steps[missions.active.stepIndex];
  if (!step.timeLimit) return null;
  return Math.max(0, step.timeLimit - missions.active.elapsed);
}
