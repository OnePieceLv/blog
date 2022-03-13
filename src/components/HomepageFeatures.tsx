import useBaseUrl from '@docusaurus/useBaseUrl';
import React from 'react';
import clsx from 'clsx';
import styles from './HomepageFeatures.module.css';
import { useSpring, animated, useTrail } from "react-spring";
import Link from '@docusaurus/Link';


export default function HomepageFeatures(): JSX.Element {
  
  const props = useSpring({
    opacity: 1,
    transform: "translateY(0)",
    from: { opacity: 0, transform: "translateY(3em)" },
    delay: 0,
  });

  const props2 = useSpring({
    opacity: 1,
    transform: "translateY(0)",
    from: { opacity: 0, transform: "translateY(3em)" },
    delay: 300,
  });

  const props3 = useSpring({
    opacity: 1,
    transform: "translateY(0)",
    from: { opacity: 0, transform: "translateY(3em)" },
    delay: 600,
  });

  const animatedTexts = useTrail(5, {
    from: { opacity: 0, transform: "translateY(3em)" },
    to: { opacity: 1, transform: "translateY(0)" },
    config: {
      mass: 3,
      friction: 45,
      tension: 460,
    },
  });

  /// <reference types="react-scripts" />
  return (
    <div className='tailwind'>
      <div className="mx-2 md:flex justify-between items-center my-6 md:my-0 h-fit md:h-[calc(100vh-220px)]">
        <animated.div style={props3} className="md:w-full flex-1 flex-col relative items-center justify-center text-5xl font-semibold md:py-6">
          <div className='mb-10 text-center'>
            Hello, 我是
            <span className="font-bold text-blue-600">Lv Wei</span>
          </div>
          <div className="font-thin text-center text-3xl">计算机编程爱好者</div>
          <div className={clsx('py-8', styles.buttons)}>
            <Link
              className="button button--secondary button--lg"
              to="/docs/intro">
                开始
            </Link>
          </div>
        </animated.div>
        <animated.div style={props3} className={"flex justify-between h-full md:w-[50%] md:h-[50%] items-center"}>
          <img src={useBaseUrl("img/home/gummy-programming.png")}/>
        </animated.div>
      </div>
    </div>
  );
}
