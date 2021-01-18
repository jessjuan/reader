import React, { useState, useEffect } from "react";
import toaster from "toasted-notes"; // requires react-spring module! yarn add toasted-notes; npm install react-spring;
import "./application.css";
import "../../global.js";

const Applications = (props) => {
  const { reviewerName } = props;

  const [error, setError] = useState("");
  const [userDecisions, setUserDecisions] = useState([]);
  const [allApplications, setAllApplications] = useState([]);
  const [remainingApps, setRemainingApps] = useState([]);
  const [comments, setComments] = useState("");
  const [flag, setFlag] = useState("No");
  const [numYeses, setNumYeses] = useState(0);
  const [votingStarted, setVotingStarted] = useState(false);
  const [votingComplete, setVotingComplete] = useState(false);

  /**
   * Formats field responses
   * for multiple select questions like "Which programming languages do you know?", converts Object [a,b,c] to "a, b, c"
   * @param {Object} entry: field response to be formatted (can be string or Object[])
   */
  const formatFieldResponse = (entry) => {
    return typeof entry !== "string" ? Array.from(entry).join(", ") : entry;
  };

  /**
   * Destructively shuffles an input array.
   * @returns shuffled array
   */
  const shuffle = (array) => {
    array.sort(() => Math.random() - 0.5);
    return array;
  };

  /**
   * Updates state variables to reflect current Airtable state,
   * To find all applications a reviewer has yet to vote on:
   * (1) GET from Decision Table, filter by Reviewer Name
   * (2) GET from All Applications Table
   * from (2) remove all records with matching IDs in (1)
   * @param {string} reviewerName: name of reviewer
   */
  const airtableStateHandler = (reviewerName) => {
    const formula = "?filterByFormula=%7BReviewer%20Name%7D%20%3D%20%20%22";
    fetch(
      global.DECISIONS_URL + formula + reviewerName + "%22&view=Grid%20view",
      {
        headers: {
          Authorization: "Bearer " + global.AIRTABLE_KEY,
        },
      }
    )
      .then((res) => res.json())
      .then(
        (result) => {
          setUserDecisions(result.records);
        },
        (error) => {
          setError(error);
        }
      );

    fetch(global.APPLICATIONS_URL + "?view=Grid%20view", {
      headers: {
        Authorization: "Bearer " + global.AIRTABLE_KEY,
      },
    })
      .then((res) => res.json())
      .then(
        (result) => {
          setAllApplications(shuffle(result.records));

          const yeses =
            global.NUM_YES -
            userDecisions.filter((r) => r.fields["Interview"] === "Yes").length;
          setNumYeses(yeses);

          const remaining = result.records.filter(
            (r) => !userDecisions.map((r) => r.fields["ID"]).includes(r.id)
          );
          setRemainingApps(remaining);
        },
        (error) => {
          setError(error);
        }
      );

    setComments("");
    setFlag("No");

    if (error) {
      return false;
    }

    return true;
  };

  /**
   * Asynchronously submits a vote via POST and calls airtableStateHandler.
   * @param {string} applicantName: applicant name
   * @param {string} reviewerName: name of reviewer
   * @param {string} vote: "Yes" or "No" (interview decision)
   * @param {string} flag: "Yes" or "No" (mark as flagged)
   * @param {string} comments: comments for this application
   * @param {string} id: application ID from the All Applications Table
   */
  const airtableVoteHandler = async (
    applicantName,
    reviewerName,
    vote,
    flag,
    comments,
    id
  ) => {
    try {
      const r = await fetch(global.DECISIONS_URL, {
        body:
          '{"records": [{"fields": {"Applicant Name": "' +
          applicantName +
          '","Reviewer Name": "' +
          reviewerName +
          '","Interview": "' +
          vote +
          '","Flag": "' +
          flag +
          '","Comments": "' +
          comments +
          '", "ID": "' +
          id +
          '"}}]}',
        headers: {
          Authorization: "Bearer " + global.AIRTABLE_KEY,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      console.log(await r.text());

      toaster.notify(
        <div className="toast">
          <h4 className="toast-text">
            Voted {vote} for {applicantName}!
          </h4>
        </div>,
        {
          duration: 1000,
          position: "bottom",
        }
      );

      airtableStateHandler(reviewerName);
      document.getElementById("app-view").scrollTop = 0;
    } catch (err) {
      console.log("fetch failed [VOTE]", err);
    }
  };

  /**
   * Displays each question and response as a new paragraph line.
   * @param {Object} fields: question : response dict
   * @param {string} k: key in fields dict, usually the app question
   * @returns paragraph response from the app (CSS app-line)
   */
  const renderAppLine = (fields, k) => {
    const fieldResponse = formatFieldResponse(fields[k]);
    if (!global.IGNORED_FIELDS.includes(k)) {
      // certain fields removed to eliminate app reader bias
      return (
        <div className="app-question" key={k}>
          <p className="app-field">
            <b>{k}</b>
          </p>
          <p className="app-response">{fieldResponse}</p>
        </div>
      );
    }
  };

  /**
   * OPTIONAL: Orders questions based on global.QUESTION_ORDER
   * @param {Object} fields: question : response dict
   */
  const orderFields = (fields) => {
    return global.QUESTION_ORDER
      ? global.QUESTION_ORDER.slice().map((i) => Object.keys(fields)[i])
      : Object.keys(fields);
  };

  /**
   * Displays the application
   * @param {dictionary} fields
   */
  const renderApp = (fields) => {
    const orderedFields = orderFields(fields);
    return orderedFields.map((k) => renderAppLine(fields, k));
  };

  /**
   * Handles the event where the user comments something
   * @param {event} event: change event
   */
  const handleCommentsChange = (event) => {
    setComments(event.target.value);
  };

  /**
   * Handles the event where the user checks the flag check box to flag an app
   * @param {event} event: change event
   */
  const handleFlagChange = (event) => {
    const flagState = event.target.checked ? "Yes" : "No";
    console.log(flagState);
    setFlag(flagState);
  };

  /** Votes "No" on the remaining apps once the user is out of yeses */
  const voteOnRemainingApps = async () => {
    document.getElementById("leftover-no-button").disabled = true;
    if (numYeses === 0) {
      console.log("Voting 'No' on remaining apps!");
      // mark remaining apps as "No"
      const records = remainingApps.map((app) => {
        let applicantName = app.fields["Name"];
        let vote = "No";
        let flag = "No";
        let comments = "";
        let id = app.id;
        return (
          '{"fields": {"Applicant Name": "' +
          applicantName +
          '","Reviewer Name": "' +
          reviewerName +
          '","Interview": "' +
          vote +
          '","Flag": "' +
          flag +
          '","Comments": "' +
          comments +
          '", "ID": "' +
          id +
          '"}}'
        );
      });

      try {
        records.map((r) =>
          fetch(global.DECISIONS_URL, {
            body: '{"records": [' + r + "]}",
            headers: {
              Authorization: "Bearer " + global.AIRTABLE_KEY,
              "Content-Type": "application/json",
            },
            method: "POST",
          })
        );
      } catch (err) {
        console.log("fetch failed [VOTE]", err);
      }
    }
    setVotingComplete(true);
    toaster.notify(
      <div className="done-toast">
        <h4 className="toast-text">All done! Great work!</h4>
      </div>,
      {
        position: "bottom",
        duration: null,
      }
    );
  };

  /** Renders the voteutton if remaining apps exist */
  const renderVoteRemainingButton = () => {
    if (remainingApps.length > 0) {
      return (
        <div>
          <h3>No Yeses Remaining</h3>
          <button
            className="leftover-no-button"
            id="leftover-no-button"
            onClick={() => {
              voteOnRemainingApps();
              console.log("rendervoteremainingbutton");
              airtableStateHandler(reviewerName);
            }}
          >
            Vote "No" on Remaining {remainingApps.length} Apps
          </button>
        </div>
      );
    } else {
      return (
        <div>
          <h3>No Apps to Review.</h3>
          <p>Visit the Airtable to make changes</p>
        </div>
      );
    }
  };

  /** Sets up app reader component */
  useEffect(() => {
    setVotingStarted(true);
    airtableStateHandler(reviewerName);
  }, []);

  const doneVoting = remainingApps.length === 0 || numYeses === 0;
  let id = "";
  let applicantName = "";
  let currentApp = null;
  const voteRemainingButton = renderVoteRemainingButton();
  if (!doneVoting) {
    const current = remainingApps[0];
    const fields = current.fields;
    id = current.id;
    applicantName = fields["Name"];
    currentApp = renderApp(fields);
  }

  return (
    <div>
      <div className="container">
        <div className="header">
          <div className="header-application">Application</div>
          <div className="header-stats">
            Apps Remaining: {remainingApps.length}
          </div>
          <div className="header-stats">Yeses Remaining: {numYeses}</div>
        </div>

        <div className="app-section">
          <div className="app-view" id="app-view">
            {currentApp}
          </div>
          <div className="app-options">
            <h3 className="reviewer-label">Reviewer:</h3>
            <p className="reviewer-name">{reviewerName}</p>
            <h4 className="comments-label">Comment:</h4>
            <textarea
              id="comments-textbox"
              className="comments-textbox"
              name="app"
              value={comments}
              disabled={true}
            ></textarea>
            <div className="flag">
              <input
                id="flag-checkbox"
                className="flag-checkbox"
                type="checkbox"
                checked={flag === "Yes"}
                disabled={true}
              ></input>
              <label htmlFor="flag-checkbox">Flag</label>
            </div>
            {doneVoting ? (
              <div className="vote"> {voteRemainingButton} </div>
            ) : (
              <div className="vote">
                {" "}
                <h3 className="vote-label">Vote</h3>
                <button
                  className="no-button"
                  disabled={numYeses <= 0}
                  onClick={() => {
                    airtableVoteHandler(
                      applicantName,
                      reviewerName,
                      "No",
                      flag,
                      comments,
                      id
                    );
                    window.scrollTo(0, 0);
                  }}
                >
                  No
                </button>
                <button
                  className="skip-button"
                  onClick={() => {
                    airtableStateHandler(reviewerName);
                    document.getElementById("app-view").scrollTop = 0;
                  }}
                >
                  Skip
                </button>
                <button
                  className="yes-button"
                  disabled={numYeses <= 0}
                  onClick={() => {
                    airtableVoteHandler(
                      applicantName,
                      reviewerName,
                      "Yes",
                      flag,
                      comments,
                      id
                    );
                    window.scrollTo(0, 0);
                  }}
                >
                  Yes
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Applications;
