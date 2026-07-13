import React from 'react';
import GitParse from './GitParse';

const App = () => (
  <div>
    <nav>
      <button type="button">Git</button>
    </nav>
    <div className="content">
      <GitParse isActive />
    </div>
  </div>
);

export default App;
