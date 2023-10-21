const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const PDFServicesSdk = require("@adobe/pdfservices-node-sdk");
const AdmZip = require("adm-zip");
const axios = require("axios");

dotenv.config();

const app = express();
const port = process.env.NODE_ENV_PORT;
app.use(bodyParser.json());
app.use(cookieParser());
app.use(cors());

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: function (_req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

app.post(
  "/process-pdf",
  upload.single("pdfFile"),
  async function (req, res) {
    try {
      const { file } = req;
      if (!file) {
        return res.status(400).json({ error: "No PDF file uploaded." });
      }

      const credentials = PDFServicesSdk.Credentials
        .servicePrincipalCredentialsBuilder()
        .withClientId(process.env.PDF_SERVICES_CLIENT_ID)
        .withClientSecret(process.env.PDF_SERVICES_CLIENT_SECRET)
        .build();

      const executionContext = PDFServicesSdk.ExecutionContext.create(
        credentials,
      );

      const options = new PDFServicesSdk.ExtractPDF.options.ExtractPdfOptions
        .Builder()
        .addElementsToExtract(
          PDFServicesSdk.ExtractPDF.options.ExtractElementType.TEXT,
        )
        .build();

      const extractPDFOperation = PDFServicesSdk.ExtractPDF.Operation
        .createNew();

      const input = PDFServicesSdk.FileRef.createFromLocalFile(
        file.path,
        PDFServicesSdk.ExtractPDF.SupportedSourceFormat.pdf,
      );

      extractPDFOperation.setInput(input);
      extractPDFOperation.setOptions(options);

      let outputFilePath = createOutputFilePath();

      function createOutputFilePath() {
        const date = new Date();
        const dateString = date.getFullYear() +
          "-" +
          ("0" + (date.getMonth() + 1)).slice(-2) +
          "-" +
          ("0" + date.getDate()).slice(-2) +
          "T" +
          ("0" + date.getHours()).slice(-2) +
          "-" +
          ("0" + date.getMinutes()).slice(-2) +
          "-" +
          ("0" + date.getSeconds()).slice(-2);
        return "output/extract-" + dateString + ".zip";
      }

      extractPDFOperation
        .execute(executionContext, { timeout: 1000000 })
        .then(function (result) {
          return result.saveAsFile(outputFilePath);
        })
        .then(async function () {
          const zip = new AdmZip(outputFilePath);
          const zipEntries = zip.getEntries();
          const jsonEntry = zipEntries.find(
            (entry) => entry.entryName === "structuredData.json",
          );

          if (!jsonEntry) {
            return res.status(500).json({ error: "No structured data found." });
          }

          const zipData = zip.readAsText(jsonEntry);
          const structuredData = JSON.parse(zipData);

          const financialData = structuredData;
          const instruction =
            "Give a credit report based on the provided financial data:";

          const gptResponse = await axios.post(
            "https://api.openai.com/v1/engines/gpt-3.5-turbo/completions",
            {
              prompt: `${instruction}`,
              max_tokens: 100,
            },
            {
              headers: {
                Authorization:
                  "Bearer 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",
                "Content-Type": "application/json",
              },
            },
          );

          const creditReport = gptResponse.data.choices[0].text;
          res.status(200).json({
            text: "Text extracted successfully",
            outputFilePath,
            creditReport,
          });
        })
        .catch(function (err) {
          if (
            err instanceof PDFServicesSdk.Error.ServiceApiError ||
            err instanceof PDFServicesSdk.Error.ServiceUsageError
          ) {
            console.error(
              "Exception encountered while executing operation",
              err,
            );
            res.status(500).json({ error: "Error extracting text." });
          } else {
            console.error(
              "Exception encountered while executing operation",
              err,
            );
            res.status(500).json({ error: "Error extracting text." });
          }
        });
    } catch (error) {
      console.error("Error extracting text:", error);
      res.status(500).json({ error: "Error extracting text." });
    }
  },
);

app.get("/", function (_req, res) {
  res.send("Credit System API is up.");
});

const startServer = async function () {
  app.listen(port, function () {
    console.log("Server started on port " + port);
  });
};

startServer();
