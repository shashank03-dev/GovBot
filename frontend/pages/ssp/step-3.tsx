import Head from 'next/head';

import SSPStepPage from '@/components/ssp/SSPStepPage';

export default function SSPStepThreeRoute() {
  return (
    <>
      <Head>
        <title>SSP Step 3 | GovBot</title>
      </Head>
      <SSPStepPage stepId="step-3" />
    </>
  );
}
