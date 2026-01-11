// Simple test script to verify the stream draining fix
import { spawn } from 'child_process';

async function testStreamDraining() {
  console.log('Testing stream draining functionality...');
  
  // Test with a simple echo command
  const proc = spawn('echo', ['Hello World'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  let stderr = '';
  
  // Set up stream draining
  const drainStream = async (stream, appendFn) => {
    return new Promise((resolve, reject) => {
      if (!stream) return resolve();
      
      let ended = false;
      const onData = (chunk) => appendFn(chunk);
      const onEnd = () => {
        if (!ended) {
          ended = true;
          stream.removeListener('data', onData);
          stream.removeListener('error', onError);
          resolve();
        }
      };
      const onError = (error) => {
        stream.removeListener('data', onData);
        stream.removeListener('end', onEnd);
        reject(error);
      };
      
      stream.on('data', onData);
      stream.on('end', onEnd);
      stream.on('error', onError);
    });
  };

  const drainStdout = drainStream(proc.stdout, (chunk) => {
    output += chunk.toString();
  });
  
  const drainStderr = drainStream(proc.stderr, (chunk) => {
    stderr += chunk.toString();
  });

  const procCompletion = new Promise((resolve, reject) => {
    proc.once('close', resolve);
    proc.once('error', reject);
  });

  // Wait for all streams and process to complete
  await Promise.all([drainStdout, drainStderr, procCompletion]);
  
  console.log('Output:', output.trim());
  console.log('Stderr:', stderr.trim());
  console.log('Test completed successfully!');
}

testStreamDraining().catch(console.error);