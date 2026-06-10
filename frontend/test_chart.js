import { fetchChartData } from './api/lib/fetchChartData.ts';

async function test() {
  try {
    const data = await fetchChartData('RELIANCE.NS', '1mo', '1d');
    console.log('Success! Points:', data.length);
    console.log('Sample:', data[data.length - 1]);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
