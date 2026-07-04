import * as THREE from "three";
import type { SoundDef } from "../types";

const DEFAULT_POOL_SIZE = 5;

interface SoundPool {
  instances: THREE.Audio[];
  nextIndex: number;
}

export class AudioSystem {
  private readonly listener = new THREE.AudioListener();
  private readonly loader = new THREE.AudioLoader();
  private readonly pools = new Map<string, SoundPool>();

  constructor(camera: THREE.Camera) {
    camera.add(this.listener);
  }

  async load(sound: SoundDef, poolSize = DEFAULT_POOL_SIZE): Promise<void> {
    const buffer = await this.loader.loadAsync(sound.path);
    const instances: THREE.Audio[] = [];
    for (let i = 0; i < poolSize; i++) {
      const audio = new THREE.Audio(this.listener);
      audio.setBuffer(buffer);
      audio.setVolume(sound.volume);
      audio.setLoop(sound.loop);
      instances.push(audio);
    }
    this.pools.set(sound.id, { instances, nextIndex: 0 });
  }

  play(soundId: string): void {
    const pool = this.pools.get(soundId);
    if (!pool) return;

    const audio = pool.instances[pool.nextIndex];
    if (audio.isPlaying) audio.stop();
    audio.play();
    pool.nextIndex = (pool.nextIndex + 1) % pool.instances.length;
  }
}
