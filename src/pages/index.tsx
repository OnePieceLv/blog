import React from 'react';
import clsx from 'clsx';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import styles from './index.module.css';
import HomepageFeatures from '../components/HomepageFeatures';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <div className='tailwind'>
      <header className={clsx('hero hero--primary', styles.heroBanner)}>
        <div className="container">
          <h1 className="hero__title">{siteConfig.title}</h1>
          <p className="hero__subtitle py-4">{siteConfig.tagline}</p>
          {/* https://stackoverflow.com/a/48222599 */}
          <div className="flex justify-center">
            <img className="items-center" src="https://i.giphy.com/media/QTfX9Ejfra3ZmNxh6B/giphy.webp" onError={({ currentTarget }) => {currentTarget.onerror=null;currentTarget.src='https://i.giphy.com/QTfX9Ejfra3ZmNxh6B.gif'}}/>
          </div>
          <div className={clsx('py-4', styles.buttons)}>
            <Link
              className="button button--secondary button--lg"
              to="/docs/intro">
                开始阅读
            </Link>
          </div>
        </div>
      </header>
    </div>
  );
}

export default function Home(): JSX.Element {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`首页`}
      description="Description will go into a meta tag in <head />">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
