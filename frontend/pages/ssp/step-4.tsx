import Head from 'next/head';

import SSPStepPage from '@/components/ssp/SSPStepPage';

export default function SSPStepFourRoute() {
  return (
    <>
      <Head>
        <title>SSP Step 4 | GovBot</title>
      </Head>
      <SSPStepPage stepId="step-4" />
    </>
  );
}
