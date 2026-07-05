import * as THREE from "three";
import type { SoundDef } from "../types";

const DEFAULT_POOL_SIZE = 5;
const POSITIONAL_REF_DISTANCE = 5;

type SoundPool =
  | { positional: false; instances: THREE.Audio[]; nextIndex: number }
  | { positional: true; instances: THREE.PositionalAudio[]; nextIndex: number };

export class AudioSystem {
  private readonly listener = new THREE.AudioListener();
  private readonly loader = new THREE.AudioLoader();
  private readonly pools = new Map<string, SoundPool>();

  constructor(camera: THREE.Camera) {
    camera.add(this.listener);
  }

  async load(sound: SoundDef, poolSize = DEFAULT_POOL_SIZE): Promise<void> {
    const buffer = await this.loader.loadAsync(sound.path);

    if (sound.positional) {
      const instances: THREE.PositionalAudio[] = [];
      for (let i = 0; i < poolSize; i++) {
        const audio = new THREE.PositionalAudio(this.listener);
        audio.setBuffer(buffer);
        audio.setVolume(sound.volume);
        audio.setLoop(sound.loop);
        audio.setRefDistance(POSITIONAL_REF_DISTANCE);
        instances.push(audio);
      }
      this.pools.set(sound.id, { positional: true, instances, nextIndex: 0 });
      return;
    }

    const instances: THREE.Audio[] = [];
    for (let i = 0; i < poolSize; i++) {
      const audio = new THREE.Audio(this.listener);
      audio.setBuffer(buffer);
      audio.setVolume(sound.volume);
      audio.setLoop(sound.loop);
      instances.push(audio);
    }
    this.pools.set(sound.id, { positional: false, instances, nextIndex: 0 });
  }

  /** Plays a non-positional sound (e.g. the local player's own weapon fire). */
  play(soundId: string): void {
    const pool = this.pools.get(soundId);
    if (!pool || pool.positional) return;

    const audio = pool.instances[pool.nextIndex];
    if (audio.isPlaying) audio.stop();
    audio.play();
    pool.nextIndex = (pool.nextIndex + 1) % pool.instances.length;
  }

  /** Plays a positional sound attached to a world object (e.g. an enemy). */
  playAt(soundId: string, object: THREE.Object3D): void {
    const pool = this.pools.get(soundId);
    if (!pool || !pool.positional) return;

    const audio = pool.instances[pool.nextIndex];
    if (audio.isPlaying) audio.stop();
    audio.parent?.remove(audio);
    object.add(audio);
    audio.play();
    pool.nextIndex = (pool.nextIndex + 1) % pool.instances.length;
  }
}
