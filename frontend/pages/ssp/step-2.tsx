import Head from 'next/head';

import SSPStepPage from '@/components/ssp/SSPStepPage';

export default function SSPStepTwoRoute() {
  return (
    <>
      <Head>
        <title>SSP Step 2 | GovBot</title>
      </Head>
      <SSPStepPage stepId="step-2" />
    </>
  );
}
