const fs = require('fs');
const path = require('path');

const soundsDir = path.join(__dirname, '..', 'public', 'sounds');

function generateWav(frequencies, durationMs, waveType = 'sine', volume = 0.8) {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * durationMs / 1000);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  const notes = frequencies.map(f => ({ freq: f, duration: durationMs / frequencies.length }));
  let offset = 44;
  let sampleIndex = 0;

  for (const note of notes) {
    const noteSamples = Math.floor(sampleRate * note.duration / 1000);
    for (let i = 0; i < noteSamples; i++) {
      const t = i / sampleRate;
      let val;
      switch (waveType) {
        case 'square':
          val = Math.sin(2 * Math.PI * note.freq * t) > 0 ? 1 : -1;
          break;
        case 'triangle':
          val = 2 * Math.abs(2 * (note.freq * t - Math.floor(note.freq * t + 0.5))) - 1;
          break;
        case 'sine':
        default:
          val = Math.sin(2 * Math.PI * note.freq * t);
      }
      const envelope = Math.min(1, i / (sampleRate * 0.01)) * Math.min(1, (noteSamples - i) / (sampleRate * 0.05));
      val *= volume * envelope;
      const intVal = Math.max(-1, Math.min(1, val)) * 32767;
      buffer.writeInt16LE(Math.round(intVal), offset);
      offset += 2;
      sampleIndex++;
    }
  }

  return buffer;
}

const sounds = {
  'classic.mp3': generateWav([880, 880], 300, 'sine', 0.9),
  'bell.mp3': generateWav([523, 659, 784, 1047], 800, 'sine', 0.8),
  'chime.mp3': generateWav([659, 784, 1047], 600, 'triangle', 0.7),
  'alert.mp3': generateWav([1000, 800, 1000, 800], 500, 'square', 0.6),
  'notification.mp3': generateWav([784, 988, 1319], 400, 'sine', 0.8)
};

Object.entries(sounds).forEach(([name, buffer]) => {
  fs.writeFileSync(path.join(soundsDir, name), buffer);
  console.log('Criado:', name, buffer.length, 'bytes');
});
