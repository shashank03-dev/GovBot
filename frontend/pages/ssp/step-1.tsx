import Head from 'next/head';

import SSPStepPage from '@/components/ssp/SSPStepPage';

export default function SSPStepOneRoute() {
  return (
    <>
      <Head>
        <title>SSP Step 1 | GovBot</title>
      </Head>
      <SSPStepPage stepId="step-1" />
    </>
  );
}
