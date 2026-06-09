import type { ISourceOptions } from "@tsparticles/engine";

export interface ParticleWidgetProps {
  preset: "sparkles" | "snow" | "confetti" | "fire";
  speed: number;
  density: number;
  opacity: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeProps(props: ParticleWidgetProps): ParticleWidgetProps {
  return {
    preset: props.preset,
    speed: clamp(props.speed, 0.1, 3),
    density: Math.floor(clamp(props.density, 10, 300)),
    opacity: clamp(props.opacity, 0, 1)
  };
}

function sparklesConfig(props: ParticleWidgetProps): ISourceOptions {
  return {
    particles: {
      number: { value: props.density },
      color: { value: ["#FFD700", "#FFF8DC", "#FFFACD", "#FFE4B5"] },
      shape: { type: "star", options: { star: { sides: 5 } } },
      opacity: {
        value: props.opacity,
        animation: { enable: true, speed: 0.5, minimumValue: 0.1, sync: false }
      },
      size: { value: { min: 2, max: 6 } },
      move: {
        enable: true,
        speed: 1.5 * props.speed,
        direction: "top",
        random: true,
        straight: false,
        outModes: "out"
      },
      rotate: {
        value: { min: 0, max: 360 },
        animation: { enable: true, speed: 10, sync: false }
      }
    },
    background: { color: { value: "transparent" } },
    detectRetina: true
  };
}

function snowConfig(props: ParticleWidgetProps): ISourceOptions {
  return {
    particles: {
      number: { value: props.density },
      color: { value: "#ffffff" },
      shape: { type: "circle" },
      opacity: { value: props.opacity },
      size: { value: { min: 2, max: 5 } },
      move: {
        enable: true,
        speed: 1 * props.speed,
        direction: "bottom",
        random: true,
        straight: false,
        outModes: "out"
      }
    },
    background: { color: { value: "transparent" } },
    detectRetina: true
  };
}

function confettiConfig(props: ParticleWidgetProps): ISourceOptions {
  return {
    particles: {
      number: { value: props.density },
      color: { value: ["#FF6B6B", "#FFE66D", "#4ECDC4", "#45B7D1", "#96CEB4", "#DDA0DD", "#FF8C00"] },
      shape: { type: ["square", "circle"] },
      opacity: { value: props.opacity },
      size: { value: { min: 3, max: 8 } },
      move: {
        enable: true,
        speed: 2 * props.speed,
        direction: "bottom",
        random: true,
        straight: false,
        outModes: "out",
        gravity: { enable: true, acceleration: 3 }
      },
      rotate: {
        value: { min: 0, max: 360 },
        animation: { enable: true, speed: 15, sync: false }
      }
    },
    background: { color: { value: "transparent" } },
    detectRetina: true
  };
}

function fireConfig(props: ParticleWidgetProps): ISourceOptions {
  return {
    particles: {
      number: { value: props.density },
      color: { value: ["#FF4500", "#FF6347", "#FF8C00", "#FFA500", "#FFD700", "#FFFF00"] },
      shape: { type: "circle" },
      opacity: {
        value: props.opacity,
        animation: { enable: true, speed: 2, minimumValue: 0, sync: false }
      },
      size: {
        value: { min: 3, max: 10 },
        animation: { enable: true, speed: 5, minimumValue: 0.5, sync: false }
      },
      move: {
        enable: true,
        speed: 2.5 * props.speed,
        direction: "top",
        random: true,
        straight: false,
        outModes: "destroy"
      }
    },
    background: { color: { value: "transparent" } },
    detectRetina: true
  };
}

export function getPresetConfig(inputProps: ParticleWidgetProps): ISourceOptions {
  const props = normalizeProps(inputProps);

  if (props.preset === "snow") {
    return snowConfig(props);
  }

  if (props.preset === "confetti") {
    return confettiConfig(props);
  }

  if (props.preset === "fire") {
    return fireConfig(props);
  }

  return sparklesConfig(props);
}